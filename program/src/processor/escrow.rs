use crate::{
    error::CashError::{
        self, AccountAlreadyClosed, AccountAlreadySettled, AccountNotInitialized,
        AccountNotSettledOrCanceled, AccountAlreadyCanceled, InsufficientSettlementFunds
    },
    instruction::InitEscrowArgs,
    state::escrow::{Escrow, EscrowState},
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

pub fn process_init_escrow(
    accounts: &[AccountInfo],
    args: InitEscrowArgs,
    program_id: &Pubkey,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    let payer_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let escrow_info = next_account_info(account_info_iter)?;
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
            Escrow::VAULT_PREFIX.as_bytes(),
            escrow_info.key.as_ref(),
            &[args.vault_bump],
        ],
    )?;

    spl_token_init(vault_token_info, mint_info, vault_token_info)?;
    let mut escrow = create_escrow(
        program_id,
        escrow_info,
        fee_payer_info,
        rent_info,
        system_account_info,
        &[
            Escrow::PREFIX.as_bytes(),
            args.reference.as_bytes(),
            &[args.escrow_bump],
        ],
    )?;

    if escrow.state != EscrowState::Uninitialized {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    escrow.state = EscrowState::Initialized;
    escrow.fee = args.fee;
    escrow.vault_token = *vault_token_info.key;
    escrow.vault_bump = args.vault_bump;
    escrow.amount = args.amount;
    escrow.mint = *mint_info.key;
    escrow.settled_at = None;
    escrow.canceled_at = None;
    escrow.authority = *authority_info.key;
    escrow.payer = *payer_info.key;

    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
    Ok(())
}

fn create_escrow<'a>(
    program_id: &Pubkey,
    escrow_info: &AccountInfo<'a>,
    payer_info: &AccountInfo<'a>,
    rent_sysvar_info: &AccountInfo<'a>,
    system_program_info: &AccountInfo<'a>,
    signer_seeds: &[&[u8]],
) -> Result<Escrow, ProgramError> {
    if escrow_info.lamports() > 0 && !escrow_info.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    // set up escrow account
    let unpack = Escrow::unpack(&escrow_info.data.borrow_mut());
    let proving_process = match unpack {
        Ok(data) => Ok(data),
        Err(_) => {
            create_new_account_raw(
                program_id,
                escrow_info,
                rent_sysvar_info,
                payer_info,
                system_program_info,
                Escrow::LEN,
                signer_seeds,
            )?;
            msg!("New escrow account was created");
            Ok(Escrow::unpack_unchecked(&escrow_info.data.borrow_mut())?)
        }
    };

    proving_process
}

pub fn process_cancel(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    msg!("Process cancel");
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;

    assert_signer(authority_info)?;

    let escrow_info = next_account_info(account_info_iter)?;
    assert_owned_by(escrow_info, program_id)?;
    let mut escrow = Escrow::unpack(&escrow_info.data.borrow())?;

    assert_account_key(
        authority_info,
        &escrow.authority,
        Some(CashError::InvalidAuthorityId),
    )?;

    let payer_token_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;

    assert_account_key(
        vault_token_info,
        &escrow.vault_token,
        Some(CashError::InvalidVaultTokenOwner),
    )?;
    let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    assert_signer(fee_payer_info)?;
    let mint_info = next_account_info(account_info_iter)?;
    assert_account_key(mint_info, &escrow.mint, Some(CashError::InvalidMint))?;
    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;

    if !escrow.is_initialized() {
        if escrow.is_canceled() {
            return Err(AccountAlreadyCanceled.into());
        }
        if escrow.is_settled() {
            return Err(AccountAlreadySettled.into());
        }
        if escrow.is_closed() {
            return Err(AccountAlreadyClosed.into());
        }
        return Err(AccountNotInitialized.into());
    }
    let vault_signer_seeds = [
        Escrow::VAULT_PREFIX.as_bytes(),
        escrow_info.key.as_ref(),
        &[escrow.vault_bump],
    ];

    if vault_token.amount > 0 {
        if vault_token.is_native() {
            assert_account_key(
                payer_token_info,
                &escrow.payer,
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
            assert_token_owned_by(&payer_token, &escrow.payer)?;
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

    msg!("Mark the escrow account as canceled...");
    escrow.state = EscrowState::Canceled;
    escrow.canceled_at = Some(clock.unix_timestamp as u64);
    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
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

    let escrow_info = next_account_info(account_info_iter)?;
    assert_owned_by(escrow_info, program_id)?;
    let mut escrow = Escrow::unpack(&escrow_info.data.borrow())?;

    assert_account_key(
        authority_info,
        &escrow.authority,
        Some(CashError::InvalidAuthorityId),
    )?;

    assert_account_key(
        vault_token_info,
        &escrow.vault_token,
        Some(CashError::InvalidVaultTokenOwner),
    )?;

    if !escrow.is_initialized() {
        if escrow.is_canceled() {
            return Err(AccountAlreadyCanceled.into());
        }
        if escrow.is_settled() {
            return Err(AccountAlreadySettled.into());
        }
        if escrow.is_closed() {
            return Err(AccountAlreadyClosed.into());
        }
        return Err(AccountNotInitialized.into());
    }
    let payer_token_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    assert_signer(fee_payer_info)?;
    let mint_info = next_account_info(account_info_iter)?;
    assert_account_key(mint_info, &escrow.mint, Some(CashError::InvalidMint))?;
    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;
    let token_program_info = next_account_info(account_info_iter)?;
    assert_account_key(token_program_info, &spl_token::id(), None)?;

    let vault_signer_seeds = [
        Escrow::VAULT_PREFIX.as_bytes(),
        escrow_info.key.as_ref(),
        &[escrow.vault_bump],
    ];

    let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
    let total = escrow.amount.checked_add(escrow.fee)
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
        if escrow.amount > 0 {
            native_transfer(fee_payer_info, dst_token_info, escrow.amount, &[])?;
        }
        if escrow.fee > 0 {
            native_transfer(fee_payer_info, fee_token_info, escrow.fee, &[])?;
        }
        if remaining > 0 {
            assert_account_key(
                payer_token_info,
                &escrow.payer,
                Some(CashError::InvalidSrcTokenOwner),
            )?;
            native_transfer(fee_payer_info, payer_token_info, remaining, &[])?;
        }
    } else {
        let _: TokenAccount = assert_initialized(dst_token_info)?;
        let _: TokenAccount = assert_initialized(fee_token_info)?;
        if escrow.amount > 0 {
            spl_token_transfer(
                vault_token_info,
                dst_token_info,
                vault_token_info,
                escrow.amount,
                &[&vault_signer_seeds],
            )?;
        }
        if escrow.fee > 0 {
            spl_token_transfer(
                vault_token_info,
                fee_token_info,
                vault_token_info,
                escrow.fee,
                &[&vault_signer_seeds],
            )?;
        }
        if remaining > 0 {
            let payer_token: TokenAccount = assert_initialized(payer_token_info)?;
            assert_token_owned_by(&payer_token, &escrow.payer)?;
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
    msg!("Mark the escrow account as settled...");
    escrow.state = EscrowState::Settled;
    escrow.settled_at = Some(clock.unix_timestamp as u64);
    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_close(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    let escrow_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    assert_owned_by(escrow_info, program_id)?;

    let escrow = Escrow::unpack(&escrow_info.data.borrow())?;
    assert_account_key(
        authority_info,
        &escrow.authority,
        Some(CashError::InvalidAuthorityId),
    )?;
    if escrow.is_closed() {
        return Err(AccountAlreadyClosed.into());
    }
    if !(escrow.is_settled() || escrow.is_canceled()) {
        return Err(AccountNotSettledOrCanceled.into());
    }
    msg!("Closing the escrow account...");
    empty_account_balance(escrow_info, fee_payer_info)?;
    Ok(())
}
