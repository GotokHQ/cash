use crate::{
    error::CashError::{
        self, AccountAlreadyCanceled, AccountAlreadyRedeemed, AccountNotCanceled,
        AccountNotInitialized, AmountOverflow, InsufficientSettlementFunds,
    },
    instruction::{CancelCashRedemptionArgs, InitCashLinkArgs, InitCashRedemptionArgs},
    math::SafeMath,
    state::{
        cashlink::{CashLink, CashLinkState, DistributionType},
        redemption::{Redemption, REDEMPTION_SIZE}, AccountType,
    },
    utils::{
        assert_account_key, assert_initialized, assert_owned_by, assert_signer,
        assert_token_owned_by, calculate_fee, create_associated_token_account_raw,
        create_new_account_raw, empty_account_balance, exists, get_random_value, native_transfer,
        spl_token_close, spl_token_transfer,
    },
};

use arrayref::array_ref;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{clock::Clock, slot_hashes, Sysvar},
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
    let cash_link_reference_info = next_account_info(account_info_iter)?;
    //let vault_token_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;

    msg!("Start to read the mint info for the cashlink");
    let mint_info = if account_info_iter.len() > 1 {
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
            cash_link_reference_info.key.as_ref(),
            &[args.cash_link_bump],
        ],
    )?;
    if args.amount == 0 {
        return Err(CashError::InvalidAmount.into());
    }
    if args.max_num_redemptions == 0 {
        return Err(CashError::InvalidNumberOfRedemptions.into());
    }
    if cash_link.state != CashLinkState::Uninitialized {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    let fee_from_bps = calculate_fee(args.amount, args.fee_bps as u64)?;
    let total_platform_fee = fee_from_bps
        .checked_add(args.fixed_fee)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;

    let total_redemption_fee = args
        .fee_to_redeem
        .checked_mul(args.max_num_redemptions as u64)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;

    let total_amount = match args.distribution_type {
        DistributionType::Fixed => {
            if args.amount % args.max_num_redemptions as u64 != 0 {
                return Err(CashError::InvalidAmount.into());
            }
            args.amount
        }
        DistributionType::Random => args.amount,
    };

    let total = total_amount
        .checked_add(total_platform_fee)
        .ok_or::<ProgramError>(CashError::Overflow.into())?
        .checked_add(total_redemption_fee)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;
    cash_link.account_type = AccountType::CashLink;
    cash_link.state = CashLinkState::Initialized;
    cash_link.amount = args.amount;
    cash_link.fee_bps = args.fee_bps;
    cash_link.fixed_fee = args.fixed_fee;
    cash_link.fee_to_redeem = args.fee_to_redeem;
    cash_link.remaining_amount = total_amount;
    cash_link.canceled_at = None;
    cash_link.authority = *authority_info.key;
    cash_link.sender = *sender_info.key;
    cash_link.distribution_type = args.distribution_type;
    cash_link.max_num_redemptions = args.max_num_redemptions;

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
            let sender_token_info = next_account_info(account_info_iter)?;
            assert_owned_by(sender_token_info, &spl_token::id())?;
            let sender_token: TokenAccount = assert_initialized(sender_token_info)?;
            assert_token_owned_by(&sender_token, sender_info.key)?;
            spl_token_transfer(sender_token_info, vault_token_info, sender_info, total, &[])?;
            //spl_token_transfer(sender_token_info, fee_token_info, sender_info, total_platform_fee, &[])?;
        }
        None => {
            native_transfer(sender_info, cash_link_info, total, &[])?;
            //native_transfer(sender_info, fee_token_info, total_platform_fee, &[])?;
            cash_link.mint = None;
        }
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

pub fn process_cancel(
    accounts: &[AccountInfo],
    program_id: &Pubkey,
    args: CancelCashRedemptionArgs,
) -> ProgramResult {
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
    let cash_link_reference_info = next_account_info(account_info_iter)?;

    let sender_token_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;

    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;
    let rent_info = next_account_info(account_info_iter)?;

    if !(cash_link.initialized() || cash_link.redeeming()) {
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
        cash_link_reference_info.key.as_ref(),
        &[args.cash_link_bump],
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
            **cash_link_info.lamports.borrow_mut() = min_lamports;

            let dest_starting_lamports = sender_token_info.lamports();
            **sender_token_info.lamports.borrow_mut() = dest_starting_lamports
                .checked_add(remaining_amount)
                .ok_or(AmountOverflow)?;
        }
    }

    msg!("Mark the cash_link account as canceled...");
    cash_link.state = CashLinkState::Canceled;
    cash_link.canceled_at = Some(clock.unix_timestamp as u64);
    CashLink::pack(cash_link, &mut cash_link_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_redemption(
    accounts: &[AccountInfo],
    args: InitCashRedemptionArgs,
    program_id: &Pubkey,
) -> ProgramResult {
    msg!("Process redemption");
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;

    assert_signer(authority_info)?;

    let user_info = next_account_info(account_info_iter)?;
    let wallet_info = next_account_info(account_info_iter)?;

    assert_signer(wallet_info)?;

    let fee_token_info = next_account_info(account_info_iter)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    assert_owned_by(cash_link_info, program_id)?;
    let mut cash_link = CashLink::unpack(&cash_link_info.data.borrow())?;

    assert_account_key(
        authority_info,
        &cash_link.authority,
        Some(CashError::InvalidAuthorityId),
    )?;

    if !(cash_link.initialized() || cash_link.redeeming()) {
        if cash_link.canceled() {
            return Err(AccountAlreadyCanceled.into());
        }
        if cash_link.redeemed() {
            return Err(AccountAlreadyRedeemed.into());
        }
        return Err(AccountNotInitialized.into());
    }
    let cash_link_reference_info = next_account_info(account_info_iter)?;

    let redemption_info = next_account_info(account_info_iter)?;
    if redemption_info.lamports() > 0 && !redemption_info.data_is_empty() {
        msg!("AccountAlreadyInitialized");
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    let sender_token_info = next_account_info(account_info_iter)?; //sender_token_info
    let fee_payer_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;
    let rent_info = next_account_info(account_info_iter)?;
    let recent_slothashes_info = next_account_info(account_info_iter)?;

    assert_account_key(
        recent_slothashes_info,
        &slot_hashes::id(),
        Some(CashError::InvalidSlotHashProgram.into()),
    )?;

    let signer_seeds = [
        CashLink::PREFIX.as_bytes(),
        cash_link_reference_info.key.as_ref(),
        &[args.cash_link_bump],
    ];

    if cash_link.total_redemptions >= cash_link.max_num_redemptions {
        return Err(CashError::MaxRedemptionsReached.into());
    }
    if cash_link.remaining_amount == 0 {
        return Err(CashError::NoRemainingAmount.into());
    }

    let amount_to_redeem = match cash_link.distribution_type {
        DistributionType::Fixed => cash_link.amount,
        DistributionType::Random => {
            // get slot hash
            let data = recent_slothashes_info.data.borrow();
            let most_recent_slothash = array_ref![data, 8, 8];
            let rand = get_random_value(most_recent_slothash, &cash_link, clock)?;

            if cash_link.total_redemptions == cash_link.max_num_redemptions - 1 {
                // Last redemption gets the remaining amount
                cash_link.remaining_amount
            } else {
                // Calculate a random amount for this redemption
                // let max_possible = cash_link.remaining_amount
                //     / (cash_link.max_num_redemptions as u64 - cash_link.total_redemptions as u64);
                // ((rand as u64) % max_possible) + 1
                // Ensure that the random amount is at least 1 and at most the remaining amount
                let max_possible = cash_link.remaining_amount;
                (rand as u64 % max_possible) + 1
            }
        }
    };

    let fee_to_redeem = cash_link.fee_to_redeem;

    cash_link.remaining_amount = cash_link
        .remaining_amount
        .checked_sub(amount_to_redeem)
        .ok_or(CashError::Overflow)?;

    cash_link.total_redemptions = cash_link.total_redemptions.error_increment()?;

    let platform_fee_per_redeem: u64 = calculate_fee(cash_link.amount, cash_link.fee_bps as u64)?
        .checked_div(cash_link.max_num_redemptions as u64)
        .ok_or(CashError::Overflow)?;

    let total_fee_to_redeem = if cash_link.total_redemptions == 1 {
        platform_fee_per_redeem
            .checked_add(fee_to_redeem)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
            .checked_add(cash_link.fixed_fee)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
    } else {
        platform_fee_per_redeem
            .checked_add(fee_to_redeem)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
    };

    let total = amount_to_redeem
        .checked_add(total_fee_to_redeem)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;

    if let Some(mint) = cash_link.mint {
        assert_owned_by(fee_token_info, &spl_token::id())?;
        let recipient_token_info = next_account_info(account_info_iter)?;
        assert_owned_by(recipient_token_info, &spl_token::id())?;
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
        let recipient_token: TokenAccount = assert_initialized(recipient_token_info)?;
        assert_token_owned_by(&recipient_token, &wallet_info.key)?;

        let _: TokenAccount = assert_initialized(fee_token_info)?;
        if amount_to_redeem > 0 {
            spl_token_transfer(
                vault_token_info,
                recipient_token_info,
                cash_link_info,
                amount_to_redeem,
                &[&signer_seeds],
            )?;
        }
        if total_fee_to_redeem > 0 {
            spl_token_transfer(
                vault_token_info,
                fee_token_info,
                cash_link_info,
                total_fee_to_redeem,
                &[&signer_seeds],
            )?;
        }
        let remaining = vault_token
            .amount
            .checked_sub(total)
            .ok_or::<ProgramError>(CashError::Overflow.into())?;
        if cash_link.is_fully_redeemed() && remaining > 0 {
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
        **cash_link_info.lamports.borrow_mut() = min_lamports;
        if amount_to_redeem > 0 {
            let dest_starting_lamports = wallet_info.lamports();
            **wallet_info.lamports.borrow_mut() = dest_starting_lamports
                .checked_add(amount_to_redeem)
                .ok_or(AmountOverflow)?;
        }
        if total_fee_to_redeem > 0 {
            let dest_starting_lamports = fee_token_info.lamports();
            **fee_token_info.lamports.borrow_mut() = dest_starting_lamports
                .checked_add(total_fee_to_redeem)
                .ok_or(AmountOverflow)?;
        }
        let remaining = available_amount.checked_sub(total).ok_or(AmountOverflow)?;
        if cash_link.is_fully_redeemed() && remaining > 0 {
            let dest_starting_lamports = sender_token_info.lamports();
            **sender_token_info.lamports.borrow_mut() = dest_starting_lamports
                .checked_add(remaining)
                .ok_or(AmountOverflow)?;
        }
    }
    let system_account_info = next_account_info(account_info_iter)?;
    create_new_account_raw(
        program_id,
        redemption_info,
        rent_info,
        fee_payer_info,
        system_account_info,
        REDEMPTION_SIZE,
        &[
            Redemption::PREFIX.as_bytes(),
            cash_link_info.key.as_ref(),
            user_info.key.as_ref(),
            &[args.redemption_bump],
        ],
    )?;
    let mut redemption = Redemption::unpack_unchecked(&redemption_info.data.borrow_mut())?;
    redemption.account_type = AccountType::Redemption;
    redemption.cash_link = *cash_link_info.key;
    redemption.redeemed_at = clock.unix_timestamp as u64;
    redemption.user = *user_info.key;
    redemption.amount = amount_to_redeem;
    Redemption::pack(redemption, &mut redemption_info.data.borrow_mut())?;
    cash_link.state = if cash_link.is_fully_redeemed() {
        CashLinkState::Redeemed
    } else {
        CashLinkState::Redeeming
    };
    cash_link.last_redeemed_at = Some(clock.unix_timestamp as u64);
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
    if cash_link.total_redemptions > 0 {
        return Err(AccountAlreadyRedeemed.into());
    }
    msg!("Closing the cash_link account...");
    empty_account_balance(cash_link_info, fee_payer_info)?;
    Ok(())
}
