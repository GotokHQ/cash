use crate::{
    error::CashError::{
        self, AccountAlreadyClosed, AccountAlreadySettled, AccountNotInitialized,
        AccountNotSettledOrCanceled, AccountAlreadyCanceled, InsufficientSettlementFunds
    },
    instruction::InitCashLinkArgs,
    state::cashlink::{CashLink, CashLinkState},
    utils::{
        assert_account_key, assert_initialized, assert_owned_by, assert_signer,
        create_new_account_raw, empty_account_balance,
        spl_token_close, spl_token_init, spl_token_transfer, assert_token_owned_by, native_transfer,
    },
};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    sysvar::{clock::Clock, Sysvar},
};
use spl_token::state::Account as TokenAccount;

pub struct Processor;

pub fn process_init_cash_link(
    accounts: &[AccountInfo],
    args: InitCashLinkArgs,
    program_id: &Pubkey,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    let payer_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;

    create_new_account_raw(
        program_id,
        vault_token_info,
        rent_info,
        fee_payer_info,
        system_account_info,
        TokenAccount::LEN,
        &[
            CashLink::VAULT_PREFIX.as_bytes(),
            cash_link_info.key.as_ref(),
            &[args.vault_bump],
        ],
    )?;

    spl_token_init(vault_token_info, mint_info, vault_token_info)?;
    let mut cash_link = create_cash_link(
        program_id,
        cash_link_info,
        fee_payer_info,
        rent_info,
        system_account_info,
        &[
            CashLink::PREFIX.as_bytes(),
            args.reference.as_bytes(),
            &[args.cash_link_bump],
        ],
    )?;

    if cash_link.state != CashLinkState::Uninitialized {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    cash_link.state = CashLinkState::Initialized;
    cash_link.fee = args.fee;
    cash_link.vault_token = *vault_token_info.key;
    cash_link.vault_bump = args.vault_bump;
    cash_link.amount = args.amount;
    cash_link.mint = *mint_info.key;
    cash_link.settled_at = None;
    cash_link.canceled_at = None;
    cash_link.authority = *authority_info.key;
    cash_link.payer = *payer_info.key;

    CashLink::pack(cash_link, &mut cash_link_info.data.borrow_mut())?;
    Ok(())
}

fn create_cash_link<'a>(
    program_id: &Pubkey,
    cash_link_info: &AccountInfo<'a>,
    payer_info: &AccountInfo<'a>,
    rent_sysvar_info: &AccountInfo<'a>,
    system_program_info: &AccountInfo<'a>,
    signer_seeds: &[&[u8]],
) -> Result<CashLink, ProgramError> {
    if cash_link_info.lamports() > 0 && !cash_link_info.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    // set up cash_link account
    let unpack = CashLink::unpack(&cash_link_info.data.borrow_mut());
    let proving_process = match unpack {
        Ok(data) => Ok(data),
        Err(_) => {
            create_new_account_raw(
                program_id,
                cash_link_info,
                rent_sysvar_info,
                payer_info,
                system_program_info,
                CashLink::LEN,
                signer_seeds,
            )?;
            msg!("New cash_link account was created");
            Ok(CashLink::unpack_unchecked(&cash_link_info.data.borrow_mut())?)
        }
    };

    proving_process
}

pub fn process_cancel(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    msg!("Process cancel");
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;

    assert_signer(authority_info)?;

    let cash_link_info = next_account_info(account_info_iter)?;
    assert_owned_by(cash_link_info, program_id)?;
    let mut cash_link = CashLink::unpack(&cash_link_info.data.borrow())?;

    assert_account_key(
        authority_info,
        &cash_link.authority,
        Some(CashError::InvalidAuthorityId),
    )?;

    let payer_token_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;

    assert_account_key(
        vault_token_info,
        &cash_link.vault_token,
        Some(CashError::InvalidVaultTokenOwner),
    )?;
    let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    assert_signer(fee_payer_info)?;
    let mint_info = next_account_info(account_info_iter)?;
    assert_account_key(mint_info, &cash_link.mint, Some(CashError::InvalidMint))?;
    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;

    if !cash_link.is_initialized() {
        if cash_link.is_canceled() {
            return Err(AccountAlreadyCanceled.into());
        }
        if cash_link.is_settled() {
            return Err(AccountAlreadySettled.into());
        }
        if cash_link.is_closed() {
            return Err(AccountAlreadyClosed.into());
        }
        return Err(AccountNotInitialized.into());
    }
    let vault_signer_seeds = [
        CashLink::VAULT_PREFIX.as_bytes(),
        cash_link_info.key.as_ref(),
        &[cash_link.vault_bump],
    ];

    if vault_token.amount > 0 {
        if vault_token.is_native() {
            assert_account_key(
                payer_token_info,
                &cash_link.payer,
                Some(CashError::InvalidSrcTokenOwner),
            )?;
            spl_token_close(
                vault_token_info,
                fee_payer_info,
                vault_token_info,
                &[&vault_signer_seeds],
            )?;
            native_transfer(fee_payer_info, payer_token_info, vault_token.amount, &[])?;
        } else {
            let payer_token: TokenAccount = assert_initialized(payer_token_info)?;
            assert_token_owned_by(&payer_token, &cash_link.payer)?;
            spl_token_transfer(
                vault_token_info,
                payer_token_info,
                vault_token_info,
                vault_token.amount,
                &[&vault_signer_seeds],
            )?;
            spl_token_close(
                vault_token_info,
                fee_payer_info,
                vault_token_info,
                &[&vault_signer_seeds],
            )?;
        }
    } else {
        spl_token_close(
            vault_token_info,
            fee_payer_info,
            vault_token_info,
            &[&vault_signer_seeds],
        )?;
    }

    msg!("Mark the cash_link account as canceled...");
    cash_link.state = CashLinkState::Canceled;
    cash_link.canceled_at = Some(clock.unix_timestamp as u64);
    CashLink::pack(cash_link, &mut cash_link_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_settlement(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    msg!("Process settlement");
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;

    assert_signer(authority_info)?;

    let dst_token_info = next_account_info(account_info_iter)?;
    let fee_token_info = next_account_info(account_info_iter)?;

    let vault_token_info = next_account_info(account_info_iter)?;
    assert_owned_by(dst_token_info, &spl_token::id())?;
    assert_owned_by(fee_token_info, &spl_token::id())?;

    assert_owned_by(vault_token_info, &spl_token::id())?;

    let cash_link_info = next_account_info(account_info_iter)?;
    assert_owned_by(cash_link_info, program_id)?;
    let mut cash_link = CashLink::unpack(&cash_link_info.data.borrow())?;

    assert_account_key(
        authority_info,
        &cash_link.authority,
        Some(CashError::InvalidAuthorityId),
    )?;

    assert_account_key(
        vault_token_info,
        &cash_link.vault_token,
        Some(CashError::InvalidVaultTokenOwner),
    )?;

    if !cash_link.is_initialized() {
        if cash_link.is_canceled() {
            return Err(AccountAlreadyCanceled.into());
        }
        if cash_link.is_settled() {
            return Err(AccountAlreadySettled.into());
        }
        if cash_link.is_closed() {
            return Err(AccountAlreadyClosed.into());
        }
        return Err(AccountNotInitialized.into());
    }
    let payer_token_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    assert_signer(fee_payer_info)?;
    let mint_info = next_account_info(account_info_iter)?;
    assert_account_key(mint_info, &cash_link.mint, Some(CashError::InvalidMint))?;
    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;
    let token_program_info = next_account_info(account_info_iter)?;
    assert_account_key(token_program_info, &spl_token::id(), None)?;

    let vault_signer_seeds = [
        CashLink::VAULT_PREFIX.as_bytes(),
        cash_link_info.key.as_ref(),
        &[cash_link.vault_bump],
    ];

    let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
    let total = cash_link.amount.checked_add(cash_link.fee)
    .ok_or::<ProgramError>(CashError::MathOverflow.into())?;
    
    if vault_token.amount < total {
        return Err(InsufficientSettlementFunds.into());
    }
    let remaining = vault_token.amount.checked_sub(total)
    .ok_or::<ProgramError>(CashError::MathOverflow.into())?;

    if vault_token.is_native() {
        spl_token_close(
            vault_token_info,
            fee_payer_info,
            vault_token_info,
            &[&vault_signer_seeds],
        )?;
        if cash_link.amount > 0 {
            native_transfer(fee_payer_info, dst_token_info, cash_link.amount, &[])?;
        }
        if cash_link.fee > 0 {
            native_transfer(fee_payer_info, fee_token_info, cash_link.fee, &[])?;
        }
        if remaining > 0 {
            assert_account_key(
                payer_token_info,
                &cash_link.payer,
                Some(CashError::InvalidSrcTokenOwner),
            )?;
            native_transfer(fee_payer_info, payer_token_info, remaining, &[])?;
        }
    } else {
        let _: TokenAccount = assert_initialized(dst_token_info)?;
        let _: TokenAccount = assert_initialized(fee_token_info)?;
        if cash_link.amount > 0 {
            spl_token_transfer(
                vault_token_info,
                dst_token_info,
                vault_token_info,
                cash_link.amount,
                &[&vault_signer_seeds],
            )?;
        }
        if cash_link.fee > 0 {
            spl_token_transfer(
                vault_token_info,
                fee_token_info,
                vault_token_info,
                cash_link.fee,
                &[&vault_signer_seeds],
            )?;
        }
        if remaining > 0 {
            let payer_token: TokenAccount = assert_initialized(payer_token_info)?;
            assert_token_owned_by(&payer_token, &cash_link.payer)?;
            spl_token_transfer(
                vault_token_info,
                payer_token_info,
                vault_token_info,
                remaining,
                &[&vault_signer_seeds],
            )?;
        }
        spl_token_close(
            vault_token_info,
            fee_payer_info,
            vault_token_info,
            &[&vault_signer_seeds],
        )?;
    }
    msg!("Mark the cash_link account as settled...");
    cash_link.state = CashLinkState::Settled;
    cash_link.settled_at = Some(clock.unix_timestamp as u64);
    CashLink::pack(cash_link, &mut cash_link_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_close(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    assert_owned_by(cash_link_info, program_id)?;

    let cash_link = CashLink::unpack(&cash_link_info.data.borrow())?;
    assert_account_key(
        authority_info,
        &cash_link.authority,
        Some(CashError::InvalidAuthorityId),
    )?;
    if cash_link.is_closed() {
        return Err(AccountAlreadyClosed.into());
    }
    if !(cash_link.is_settled() || cash_link.is_canceled()) {
        return Err(AccountNotSettledOrCanceled.into());
    }
    msg!("Closing the cash_link account...");
    empty_account_balance(cash_link_info, fee_payer_info)?;
    Ok(())
}
