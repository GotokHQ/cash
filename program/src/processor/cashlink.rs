use crate::{
    error::CashError::{
        self, AccountAlreadyCanceled, AccountAlreadyRedeemed,
        AccountNotInitialized, AccountNotCanceled, AmountOverflow,
        InsufficientSettlementFunds,
    },
    instruction::InitCashLinkArgs,
    state::cashlink::{CashLink, CashLinkState},
    utils::{
        assert_account_key, assert_initialized, assert_owned_by, assert_signer,
        assert_token_owned_by, create_associated_token_account_raw, create_new_account_raw,
        empty_account_balance, exists, native_transfer, spl_token_close, spl_token_transfer,
    },
};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{clock::Clock, Sysvar},
};
use spl_associated_token_account::get_associated_token_address;
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
    let sender_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    //let vault_token_info = next_account_info(account_info_iter)?;
    let reference_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;
    let _ = next_account_info(account_info_iter)?;

    msg!("Start to read the mint info for the cashlink");
    let mint_info = if account_info_iter.len() > 0 {
        msg!("Read the mint info for the cashlink");
        Some(next_account_info(account_info_iter)?)
    } else {
        None
    };

    let mut cash_link = create_cash_link(
        program_id,
        cash_link_info,
        fee_payer_info,
        rent_info,
        system_account_info,
        &[
            CashLink::PREFIX.as_bytes(),
            reference_info.key.as_ref(),
            &[args.cash_link_bump],
        ],
    )?;

    if cash_link.state != CashLinkState::Uninitialized {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    cash_link.state = CashLinkState::Initialized;
    cash_link.fee = args.fee;
    cash_link.cash_link_bump = args.cash_link_bump;
    cash_link.amount = args.amount;
    cash_link.reference = *reference_info.key;
    cash_link.redeemed_at = None;
    cash_link.canceled_at = None;
    cash_link.authority = *authority_info.key;
    cash_link.sender = *sender_info.key;

    match mint_info {
        Some(info) => {
            cash_link.mint = Some(*info.key);
            let vault_token_info = next_account_info(account_info_iter)?;
            let associated_token_account =
                get_associated_token_address(&cash_link_info.key, &info.key);
            // let vault_token: TokenAccount = assert_initialized(associated_token_account)?;
            // assert_token_owned_by(&vault_token, cash_link_info.key)?;
            assert_account_key(
                vault_token_info,
                &associated_token_account,
                Some(CashError::InvalidVaultTokenOwner),
            )?;
            if exists(vault_token_info)? {
                msg!("Cash link has a mint and an existing vault token. Validate the vault token");
                let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
                assert_owned_by(vault_token_info, &spl_token::id())?;
                assert_token_owned_by(&vault_token, cash_link_info.key)?;
                assert_account_key(info, &vault_token.mint, Some(CashError::InvalidMint))?;
            } else {
                msg!("Cash link has a mint. Create an associated token account for the value");
                create_associated_token_account_raw(
                    fee_payer_info,
                    vault_token_info,
                    cash_link_info,
                    info,
                    rent_info,
                )?;
            }
        }
        None => cash_link.mint = None,
    };
    CashLink::pack(cash_link, &mut cash_link_info.data.borrow_mut())?;
    Ok(())
}

fn create_cash_link<'a>(
    program_id: &Pubkey,
    cash_link_info: &AccountInfo<'a>,
    sender_info: &AccountInfo<'a>,
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
                sender_info,
                system_program_info,
                CashLink::LEN,
                signer_seeds,
            )?;
            msg!("New cash_link account was created");
            Ok(CashLink::unpack_unchecked(
                &cash_link_info.data.borrow_mut(),
            )?)
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

    let sender_token_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;

    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;
    let rent_info = next_account_info(account_info_iter)?;

    if !cash_link.initialized() {
        if cash_link.canceled() {
            return Err(AccountAlreadyCanceled.into());
        }
        if cash_link.redeemed() {
            return Err(AccountAlreadyRedeemed.into());
        }
        return Err(AccountNotInitialized.into());
    }
    let signer_seeds = [
        CashLink::PREFIX.as_bytes(),
        cash_link.reference.as_ref(),
        &[cash_link.cash_link_bump],
    ];

    if let Some(mint) = cash_link.mint {
        let vault_token_info = next_account_info(account_info_iter)?;
        let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
        // assert_account_key(vault_token.mint, mint, Some(CashError::InvalidMint))?;
        let associated_token_account = get_associated_token_address(&cash_link_info.key, &mint);
        assert_account_key(
            vault_token_info,
            &associated_token_account,
            Some(CashError::InvalidVaultTokenOwner),
        )?;
        if vault_token.amount > 0 {
            let sender_token: TokenAccount = assert_initialized(sender_token_info)?;
            assert_token_owned_by(&sender_token, &cash_link.sender)?;
            spl_token_transfer(
                vault_token_info,
                sender_token_info,
                cash_link_info,
                vault_token.amount,
                &[&signer_seeds],
            )?;
            spl_token_close(
                vault_token_info,
                fee_payer_info,
                cash_link_info,
                &[&signer_seeds],
            )?;
        } else {
            spl_token_close(
                vault_token_info,
                fee_payer_info,
                cash_link_info,
                &[&signer_seeds],
            )?;
        }
    } else {
        let rent = &Rent::from_account_info(rent_info)?;
        let min_lamports = rent.minimum_balance(CashLink::LEN);
        let source_starting_lamports = cash_link_info.lamports();
        let remaining_amount = source_starting_lamports
            .checked_sub(min_lamports)
            .ok_or(AmountOverflow)?;
        if remaining_amount > 0 {
            native_transfer(
                cash_link_info,
                sender_token_info,
                cash_link.fee,
                &[&signer_seeds],
            )?;
            // **cash_link_info.lamports.borrow_mut() = min_lamports;

            // let dest_starting_lamports = sender_token_info.lamports();
            // **sender_token_info.lamports.borrow_mut() = dest_starting_lamports
            //     .checked_add(remaining_amount)
            //     .ok_or(AmountOverflow)?;
        }
    }

    msg!("Mark the cash_link account as canceled...");
    cash_link.state = CashLinkState::Canceled;
    cash_link.canceled_at = Some(clock.unix_timestamp as u64);
    CashLink::pack(cash_link, &mut cash_link_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_redemption(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    msg!("Process redemption");
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;

    assert_signer(authority_info)?;

    let recipient_token_info = next_account_info(account_info_iter)?;
    let fee_token_info = next_account_info(account_info_iter)?;

    assert_owned_by(recipient_token_info, &spl_token::id())?;
    assert_owned_by(fee_token_info, &spl_token::id())?;

    let cash_link_info = next_account_info(account_info_iter)?;
    assert_owned_by(cash_link_info, program_id)?;
    let mut cash_link = CashLink::unpack(&cash_link_info.data.borrow())?;

    assert_account_key(
        authority_info,
        &cash_link.authority,
        Some(CashError::InvalidAuthorityId),
    )?;

    if !cash_link.initialized() {
        if cash_link.canceled() {
            return Err(AccountAlreadyCanceled.into());
        }
        if cash_link.redeemed() {
            return Err(AccountAlreadyRedeemed.into());
        }
        return Err(AccountNotInitialized.into());
    }
    let sender_token_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;
    let rent_info = next_account_info(account_info_iter)?;
    let signer_seeds = [
        CashLink::PREFIX.as_bytes(),
        cash_link.reference.as_ref(),
        &[cash_link.cash_link_bump],
    ];

    let total = cash_link
        .amount
        .checked_add(cash_link.fee)
        .ok_or::<ProgramError>(CashError::MathOverflow.into())?;

    if let Some(mint) = cash_link.mint {
        let vault_token_info = next_account_info(account_info_iter)?;
        assert_owned_by(vault_token_info, &spl_token::id())?;
        let associated_token_account = get_associated_token_address(&cash_link_info.key, &mint);
        assert_account_key(
            vault_token_info,
            &associated_token_account,
            Some(CashError::InvalidVaultTokenOwner),
        )?;
        let vault_token: TokenAccount = assert_initialized(vault_token_info)?;

        if vault_token.amount < total {
            return Err(InsufficientSettlementFunds.into());
        }
        let remaining = vault_token
            .amount
            .checked_sub(total)
            .ok_or::<ProgramError>(CashError::MathOverflow.into())?;

        let _: TokenAccount = assert_initialized(recipient_token_info)?;
        let _: TokenAccount = assert_initialized(fee_token_info)?;
        if cash_link.amount > 0 {
            spl_token_transfer(
                vault_token_info,
                recipient_token_info,
                cash_link_info,
                cash_link.amount,
                &[&signer_seeds],
            )?;
        }
        if cash_link.fee > 0 {
            spl_token_transfer(
                vault_token_info,
                fee_token_info,
                cash_link_info,
                cash_link.fee,
                &[&signer_seeds],
            )?;
        }
        if remaining > 0 {
            let sender_token: TokenAccount = assert_initialized(sender_token_info)?;
            assert_token_owned_by(&sender_token, &cash_link.sender)?;
            spl_token_transfer(
                vault_token_info,
                sender_token_info,
                cash_link_info,
                remaining,
                &[&signer_seeds],
            )?;
        }
        spl_token_close(
            vault_token_info,
            fee_payer_info,
            cash_link_info,
            &[&signer_seeds],
        )?;
    } else {
        let rent = &Rent::from_account_info(rent_info)?;
        let min_lamports = rent.minimum_balance(CashLink::LEN);
        let source_starting_lamports = cash_link_info.lamports();
        let available_amount = source_starting_lamports
            .checked_sub(min_lamports)
            .ok_or(AmountOverflow)?;
        if available_amount < total {
            return Err(InsufficientSettlementFunds.into());
        }
        let remaining = available_amount.checked_sub(total).ok_or(AmountOverflow)?;
        if cash_link.amount > 0 {
            native_transfer(
                cash_link_info,
                recipient_token_info,
                cash_link.amount,
                &[&signer_seeds],
            )?;
        }
        if cash_link.fee > 0 {
            native_transfer(
                cash_link_info,
                fee_token_info,
                cash_link.fee,
                &[&signer_seeds],
            )?;
        }
        if remaining > 0 {
            native_transfer(
                cash_link_info,
                sender_token_info,
                remaining,
                &[&signer_seeds],
            )?;
        }
    }
    msg!("Mark the cash_link account as redeemed...");
    cash_link.state = CashLinkState::Redeemed;
    cash_link.redeemed_at = Some(clock.unix_timestamp as u64);
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
    if !cash_link.canceled() {
        return Err(AccountNotCanceled.into());
    }
    msg!("Closing the cash_link account...");
    empty_account_balance(cash_link_info, fee_payer_info)?;
    Ok(())
}
