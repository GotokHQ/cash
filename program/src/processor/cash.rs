use crate::{
    error::CashError::{
        self, AccountAlreadyCanceled, AccountAlreadyRedeemed, AccountNotCanceled,
        InsufficientSettlementFunds,
    },
    instruction::{CancelCashRedemptionArgs, InitCashArgs, InitCashRedemptionArgs},
    math::SafeMath,
    state::{
        cash::{Cash, CashState, DistributionType},
        AccountType,
    },
    utils::{
        assert_account_key, assert_initialized, assert_owned_by, assert_signer,
        assert_token_owned_by, assert_valid_token_program, calculate_fee, cmp_pubkeys,
        create_associated_token_account_raw, create_new_account_raw, empty_account_balance, exists,
        get_random_value, native_transfer, spl_token_close, spl_token_transfer, sync_native,
    },
};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    sysvar::{clock::Clock, slot_hashes, Sysvar},
};
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token_2022::state::{Account as TokenAccount, Mint};

pub struct Processor;

pub fn process_init(
    accounts: &[AccountInfo],
    args: InitCashArgs,
    program_id: &Pubkey,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    let owner_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    let pass_info = if args.is_locked {
        Some(next_account_info(account_info_iter)?)
    } else {
        None
    };
    let mint_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;
    let owner_token_info = next_account_info(account_info_iter)?;
    //let vault_token_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    assert_valid_token_program(&token_program_info.key)?;
    let mut cash = create_cash_link(
        program_id,
        cash_link_info,
        fee_payer_info,
        rent_info,
        system_account_info,
        &[
            Cash::PREFIX.as_bytes(),
            args.cash_reference.as_bytes(),
            &[args.cash_bump],
        ],
    )?;
    if args.amount == 0 {
        return Err(CashError::InvalidAmount.into());
    }
    if args.max_num_redemptions == 0 {
        return Err(CashError::InvalidNumberOfRedemptions.into());
    }
    let fee_from_bps = calculate_fee(args.amount, args.fee_bps as u64)?;

    let total_platform_fee = fee_from_bps
        .checked_add(args.network_fee)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;

    let total_redemption_fee = args
        .base_fee_to_redeem
        .checked_add(args.rent_fee_to_redeem)
        .ok_or::<ProgramError>(CashError::Overflow.into())?
        .checked_mul(args.max_num_redemptions as u64)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;

    let total_amount = match args.distribution_type {
        DistributionType::Fixed => {
            if args.amount % args.max_num_redemptions as u64 != 0 {
                return Err(CashError::InvalidAmount.into());
            }
            args.amount
        }
        _ => args.amount,
    };
    if args.distribution_type == DistributionType::Random {
        if args.min_amount.is_none() {
            return Err(CashError::MinAmountNotSet.into());
        }
        if let Some(min_amount) = args.min_amount {
            if min_amount > total_amount {
                return Err(CashError::MinAmountMustBeLessThanAmount.into());
            }
        }
    }
    // if args.num_days_to_expire == 0 {
    //     return Err(CashError::InvalidExpiryInDays.into());
    // }
    //let now = clock.unix_timestamp as u64;
    let total = total_amount
        .checked_add(total_platform_fee)
        .ok_or::<ProgramError>(CashError::Overflow.into())?
        .checked_add(total_redemption_fee)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;
    cash.account_type = AccountType::Cash;
    cash.state = CashState::Initialized;
    cash.amount = total_amount;
    cash.fee_bps = args.fee_bps;
    cash.base_fee_to_redeem = args.base_fee_to_redeem;
    cash.rent_fee_to_redeem = args.rent_fee_to_redeem;
    cash.network_fee = args.network_fee;
    cash.remaining_amount = total_amount;
    cash.authority = *authority_info.key;
    cash.pass_key = pass_info.map(|pass| *pass.key);
    cash.owner = *owner_info.key;
    cash.distribution_type = args.distribution_type;
    cash.max_num_redemptions = args.max_num_redemptions;
    //cash.expires_at = now + (args.num_days_to_expire as u64 * 86400);
    cash.min_amount = match args.min_amount {
        Some(amount) if amount > total_amount => {
            return Err(CashError::MinAmountMustBeLessThanAmount.into())
        }
        Some(amount) => amount,
        None => 1,
    };
    cash.mint = *mint_info.key;
    let associated_token_account = get_associated_token_address_with_program_id(
        &cash_link_info.key,
        &mint_info.key,
        &token_program_info.key,
    );
    assert_account_key(
        vault_token_info,
        &associated_token_account,
        Some(CashError::InvalidVaultTokenOwner),
    )?;
    if exists(vault_token_info)? {
        let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
        assert_owned_by(vault_token_info, &token_program_info.key)?;
        assert_token_owned_by(&vault_token, cash_link_info.key)?;
        assert_account_key(mint_info, &vault_token.mint, Some(CashError::InvalidMint))?;
    } else {
        create_associated_token_account_raw(
            fee_payer_info,
            vault_token_info,
            cash_link_info,
            mint_info,
            rent_info,
            &token_program_info.key,
        )?;
    }
    assert_owned_by(owner_token_info, &token_program_info.key)?;
    let owner_token: TokenAccount = assert_initialized(owner_token_info)?;
    let mint: Mint = assert_initialized(mint_info)?;
    if cmp_pubkeys(&owner_info.key, &spl_token::native_mint::id())
        || cmp_pubkeys(&owner_info.key, &spl_token_2022::native_mint::id())
    {
        native_transfer(owner_info, vault_token_info, total, &[])?;
        sync_native(vault_token_info, &token_program_info.key)?;
    } else {
        assert_token_owned_by(&owner_token, owner_info.key)?;
        spl_token_transfer(
            owner_token_info,
            vault_token_info,
            owner_info,
            &mint_info,
            &token_program_info.key,
            total,
            mint.decimals,
            &[],
        )?;
    }
    //spl_token_transfer(owner_token_info, fee_token_info, owner_info, total_platform_fee, &[])?;
    Cash::pack(cash, &mut cash_link_info.data.borrow_mut())?;
    Ok(())
}

fn create_cash_link<'a>(
    program_id: &Pubkey,
    cash_link_info: &AccountInfo<'a>,
    payer_info: &AccountInfo<'a>,
    rent_sysvar_info: &AccountInfo<'a>,
    system_program_info: &AccountInfo<'a>,
    signer_seeds: &[&[u8]],
) -> Result<Cash, ProgramError> {
    if cash_link_info.lamports() > 0 && !cash_link_info.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    // set up cash account
    let unpack = Cash::unpack(&cash_link_info.data.borrow_mut());
    let proving_process = match unpack {
        Ok(data) => Ok(data),
        Err(_) => {
            create_new_account_raw(
                program_id,
                cash_link_info,
                rent_sysvar_info,
                payer_info,
                system_program_info,
                Cash::LEN,
                signer_seeds,
            )?;
            Ok(Cash::unpack_unchecked(&cash_link_info.data.borrow_mut())?)
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
    let mut cash = Cash::unpack(&cash_link_info.data.borrow())?;
    assert_owned_by(cash_link_info, program_id)?;
    assert_account_key(
        authority_info,
        &cash.authority,
        Some(CashError::InvalidAuthorityId),
    )?;
    let owner_token_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;

    let token_program_info = next_account_info(account_info_iter)?;
    assert_valid_token_program(&token_program_info.key)?;

    if cash.canceled() {
        return Err(AccountAlreadyCanceled.into());
    }
    if cash.redeemed() {
        return Err(AccountAlreadyRedeemed.into());
    }

    // if (clock.unix_timestamp as u64) <= cash.expires_at {
    //     return Err(CashError::CashlinkNotExpired.into());
    // }

    let signer_seeds = [
        Cash::PREFIX.as_bytes(),
        args.cash_reference.as_bytes(),
        &[args.cash_bump],
    ];

    let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
    let mint: Mint = assert_initialized(mint_info)?;
    // assert_account_key(vault_token.mint, mint, Some(CashError::InvalidMint))?;
    let associated_token_account = get_associated_token_address_with_program_id(
        &cash_link_info.key,
        &cash.mint,
        &token_program_info.key,
    );
    assert_account_key(
        vault_token_info,
        &associated_token_account,
        Some(CashError::InvalidVaultTokenOwner),
    )?;
    if vault_token.amount > 0 {
        if cmp_pubkeys(&owner_token_info.key, &spl_token::native_mint::id())
            || cmp_pubkeys(&owner_token_info.key, &spl_token_2022::native_mint::id())
        {
            spl_token_close(
                vault_token_info,
                fee_payer_info,
                cash_link_info,
                &token_program_info.key,
                &[&signer_seeds],
            )?;
            native_transfer(fee_payer_info, owner_token_info, vault_token.amount, &[])?;
        } else {
            let owner_token: TokenAccount = assert_initialized(owner_token_info)?;
            assert_token_owned_by(&owner_token, &cash.owner)?;
            spl_token_transfer(
                vault_token_info,
                owner_token_info,
                cash_link_info,
                mint_info,
                &token_program_info.key,
                vault_token.amount,
                mint.decimals,
                &[&signer_seeds],
            )?;
            spl_token_close(
                vault_token_info,
                fee_payer_info,
                cash_link_info,
                &token_program_info.key,
                &[&signer_seeds],
            )?;
        }
    } else {
        spl_token_close(
            vault_token_info,
            fee_payer_info,
            cash_link_info,
            &token_program_info.key,
            &[&signer_seeds],
        )?;
    }
    msg!("Mark the cash account as canceled...");
    cash.state = CashState::Canceled;
    Cash::pack(cash, &mut cash_link_info.data.borrow_mut())?;
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

    let wallet_info = next_account_info(account_info_iter)?;
    let fee_token_info = next_account_info(account_info_iter)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    assert_owned_by(cash_link_info, program_id)?;
    let mut cash = Cash::unpack(&cash_link_info.data.borrow())?;
    assert_account_key(
        authority_info,
        &cash.authority,
        Some(CashError::InvalidAuthorityId),
    )?;
    let pass_info = cash
        .pass_key
        .map(|_| next_account_info(account_info_iter))
        .transpose()?;

    if let Some((pass_info, pass_key)) = pass_info.zip(cash.pass_key.as_ref()) {
        assert_account_key(pass_info, pass_key, Some(CashError::InvalidPassKey))?;
        assert_signer(pass_info)?;
    } else if pass_info.is_some() || cash.pass_key.is_some() {
        return Err(CashError::InvalidPassKey.into());
    }
    if cash.canceled() {
        return Err(AccountAlreadyCanceled.into());
    }
    if cash.redeemed() {
        return Err(AccountAlreadyRedeemed.into());
    }
    let owner_token_info = next_account_info(account_info_iter)?; //owner_token_info
    let fee_payer_info = next_account_info(account_info_iter)?;
    let fee_payer_token_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;
    let recipient_token_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;
    let rent_info = next_account_info(account_info_iter)?;
    let recent_slothashes_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    assert_account_key(
        recent_slothashes_info,
        &slot_hashes::id(),
        Some(CashError::InvalidSlotHashProgram.into()),
    )?;

    assert_valid_token_program(&token_program_info.key)?;

    let signer_seeds = [
        Cash::PREFIX.as_bytes(),
        args.cash_reference.as_ref(),
        &[args.cash_bump],
    ];

    if cash.total_redemptions >= cash.max_num_redemptions {
        return Err(CashError::MaxRedemptionsReached.into());
    }
    if cash.remaining_amount == 0 {
        return Err(CashError::NoRemainingAmount.into());
    }

    let amount_to_redeem = match cash.distribution_type {
        DistributionType::Fixed => cash
            .amount
            .checked_div(cash.max_num_redemptions as u64)
            .ok_or(CashError::Overflow)?,
        DistributionType::Random => {
            if cash.max_num_redemptions == 1
                || cash.total_redemptions == (cash.max_num_redemptions - 1)
            {
                cash.remaining_amount
            } else {
                // get slot hash
                // let max_possible = cash
                //     .remaining_amount
                //     .checked_div(cash.max_num_redemptions as u64)
                //     .and_then(|amount| amount.checked_mul(2))
                //     .ok_or(CashError::Overflow)?;

                // let rand =
                //     get_random_value(recent_slothashes_info, clock)? as f64 / u64::MAX as f64;
                // let money;

                // if max_possible > cash.min_amount {
                //     let range_amount = max_possible - cash.min_amount;
                //     money = cash.min_amount + (rand * range_amount as f64) as u64;
                // } else {
                //     money = cash.min_amount;
                // }
                // money
                let remaining_redemptions = cash.max_num_redemptions - cash.total_redemptions;
                let average_possible = cash.remaining_amount / remaining_redemptions as u64;
                let max_possible = average_possible * 2;

                let min_possible = cash.min_amount.min(cash.remaining_amount);
                let max_possible = max_possible.min(cash.remaining_amount);

                if max_possible > min_possible {
                    let rand = get_random_value(recent_slothashes_info, clock)?;
                    let range = max_possible - min_possible + 1;
                    let random_amount = min_possible + (rand % range);
                    random_amount
                } else {
                    min_possible
                }
            }
        }
        DistributionType::Weighted => {
            let weight_ppm = args.weight_ppm.ok_or(CashError::WeightNotProvided)?;

            // Validate that weight_ppm is within acceptable range (0 to 1,000,000)
            if weight_ppm == 0 || weight_ppm > 1_000_000 {
                return Err(CashError::InvalidWeight.into());
            }

            // Calculate new total weight
            let new_total_weight_ppm = cash
                .total_weight_ppm
                .checked_add(weight_ppm)
                .ok_or(CashError::Overflow)?;

            // Ensure that total weight does not exceed 1,000,000 PPM (100%)
            if new_total_weight_ppm > 1_000_000 {
                return Err(CashError::TotalWeightExceeded.into());
            }

            // Calculate amount to redeem based on the total amount
            let amount_to_redeem = cash
                .amount
                .checked_mul(weight_ppm as u64)
                .ok_or(CashError::Overflow)?
                .checked_div(1_000_000)
                .ok_or(CashError::Overflow)?;

            // Ensure amount_to_redeem does not exceed remaining_amount
            let amount_to_redeem = amount_to_redeem.min(cash.remaining_amount);

            // Update cumulative weight
            cash.total_weight_ppm = new_total_weight_ppm;

            amount_to_redeem
        }
        DistributionType::Equal => {
            // Calculate the equal amount per redemption
            let amount_to_redeem = cash
                .amount
                .checked_div(cash.max_num_redemptions as u64)
                .ok_or(CashError::Overflow)?;
            amount_to_redeem
        }
    };

    let fee_to_redeem = cash.max_fee_to_redeem()?;

    cash.remaining_amount = cash
        .remaining_amount
        .checked_sub(amount_to_redeem)
        .ok_or(CashError::Overflow)?;

    cash.total_redemptions = cash.total_redemptions.error_increment()?;

    let platform_fee_per_redeem: u64 = calculate_fee(cash.amount, cash.fee_bps as u64)?
        .checked_div(cash.max_num_redemptions as u64)
        .ok_or(CashError::Overflow)?;

    let mut total_fee_to_redeem = if cash.total_redemptions == 1 {
        platform_fee_per_redeem
            .checked_add(fee_to_redeem)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
            .checked_add(cash.network_fee)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
    } else {
        platform_fee_per_redeem
            .checked_add(fee_to_redeem)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
    };

    let mut total = amount_to_redeem
        .checked_add(total_fee_to_redeem)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;
    assert_owned_by(vault_token_info, &token_program_info.key)?;
    let associated_token_account = get_associated_token_address_with_program_id(
        &cash_link_info.key,
        &cash.mint,
        &token_program_info.key,
    );
    assert_account_key(
        vault_token_info,
        &associated_token_account,
        Some(CashError::InvalidVaultTokenOwner),
    )?;
    let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
    let mint: Mint = assert_initialized(mint_info)?;
    let fee_payer_token: TokenAccount = assert_initialized(fee_payer_token_info)?;
    assert_token_owned_by(&fee_payer_token, &fee_payer_info.key)?;
    assert_owned_by(fee_payer_token_info, &token_program_info.key)?;
    let _: TokenAccount = assert_initialized(fee_token_info)?;
    assert_owned_by(fee_token_info, &token_program_info.key)?;
    if exists(recipient_token_info)? {
        let recipient_token: TokenAccount = assert_initialized(recipient_token_info)?;
        assert_token_owned_by(&recipient_token, &wallet_info.key)?;
        assert_owned_by(recipient_token_info, &token_program_info.key)?;
        //subtract rent_fee
        total_fee_to_redeem = total_fee_to_redeem
            .checked_sub(cash.rent_fee_to_redeem)
            .ok_or::<ProgramError>(CashError::Overflow.into())?;
        total = amount_to_redeem
            .checked_add(total_fee_to_redeem)
            .ok_or::<ProgramError>(CashError::Overflow.into())?;
    } else {
        create_associated_token_account_raw(
            fee_payer_info,
            recipient_token_info,
            wallet_info,
            mint_info,
            rent_info,
            &token_program_info.key,
        )?;
    }
    if vault_token.amount < total {
        return Err(InsufficientSettlementFunds.into());
    }
    spl_token_transfer(
        vault_token_info,
        recipient_token_info,
        cash_link_info,
        mint_info,
        &token_program_info.key,
        amount_to_redeem,
        mint.decimals,
        &[&signer_seeds],
    )?;
    if platform_fee_per_redeem > 0 {
        if let Some(referrer_fee_bps) = args.referrer_fee_bps {
            let referral_wallet_info = next_account_info(account_info_iter)?;
            let referral_account_info = next_account_info(account_info_iter)?;
            if exists(referral_account_info)? {
                let referral_token: TokenAccount = assert_initialized(referral_account_info)?;
                assert_token_owned_by(&referral_token, &referral_wallet_info.key)?;
                assert_owned_by(referral_account_info, &token_program_info.key)?;
            } else {
                create_associated_token_account_raw(
                    fee_payer_info,
                    referral_account_info,
                    referral_wallet_info,
                    mint_info,
                    rent_info,
                    &token_program_info.key,
                )?;
            }
            let referee_fee_bps = match args.referee_fee_bps {
                Some(fee) => fee,
                None => 0,
            };

            let commission_bps = referrer_fee_bps
                .checked_add(referee_fee_bps)
                .ok_or(CashError::Overflow)?;

            if commission_bps > 10000 {
                return Err(CashError::InvalidReferralFees.into());
            }
            let referrer_fee: u64 =
                calculate_fee(platform_fee_per_redeem, referrer_fee_bps as u64)?;

            let referee_fee: u64 = calculate_fee(platform_fee_per_redeem, referee_fee_bps as u64)?;

            let platform_fee = platform_fee_per_redeem
                .checked_sub(referrer_fee)
                .ok_or(CashError::Overflow)?
                .checked_sub(referee_fee)
                .ok_or(CashError::Overflow)?;

            if platform_fee > 0 {
                spl_token_transfer(
                    vault_token_info,
                    fee_token_info,
                    cash_link_info,
                    mint_info,
                    &token_program_info.key,
                    platform_fee,
                    mint.decimals,
                    &[&signer_seeds],
                )?;
            }
            if referrer_fee > 0 {
                spl_token_transfer(
                    vault_token_info,
                    referral_account_info,
                    cash_link_info,
                    mint_info,
                    &token_program_info.key,
                    referrer_fee,
                    mint.decimals,
                    &[&signer_seeds],
                )?;
            }
            if referee_fee > 0 {
                spl_token_transfer(
                    vault_token_info,
                    owner_token_info,
                    cash_link_info,
                    mint_info,
                    &token_program_info.key,
                    referee_fee,
                    mint.decimals,
                    &[&signer_seeds],
                )?;
            }
        } else {
            spl_token_transfer(
                vault_token_info,
                fee_token_info,
                cash_link_info,
                mint_info,
                &token_program_info.key,
                platform_fee_per_redeem,
                mint.decimals,
                &[&signer_seeds],
            )?;
        }
    }
    let total_network_fee = total_fee_to_redeem
        .checked_sub(platform_fee_per_redeem)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;
    if total_network_fee > 0 {
        spl_token_transfer(
            vault_token_info,
            fee_payer_token_info,
            cash_link_info,
            mint_info,
            &token_program_info.key,
            total_network_fee,
            mint.decimals,
            &[&signer_seeds],
        )?;
    }
    let remaining = vault_token
        .amount
        .checked_sub(total)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;
    if cash.is_fully_redeemed()? {
        if cmp_pubkeys(&owner_token_info.key, &spl_token::native_mint::id())
            || cmp_pubkeys(&owner_token_info.key, &spl_token_2022::native_mint::id())
        {
            spl_token_close(
                vault_token_info,
                fee_payer_info,
                cash_link_info,
                &token_program_info.key,
                &[&signer_seeds],
            )?;
            if remaining > 0 {
                native_transfer(fee_payer_info, owner_token_info, remaining, &[])?;
            }
        } else {
            let owner_token: TokenAccount = assert_initialized(owner_token_info)?;
            assert_token_owned_by(&owner_token, &cash.owner)?;
            if remaining > 0 {
                spl_token_transfer(
                    vault_token_info,
                    owner_token_info,
                    cash_link_info,
                    mint_info,
                    &token_program_info.key,
                    remaining,
                    mint.decimals,
                    &[&signer_seeds],
                )?;
            }
            spl_token_close(
                vault_token_info,
                fee_payer_info,
                cash_link_info,
                &token_program_info.key,
                &[&signer_seeds],
            )?;
        }
    }
    cash.state = if cash.is_fully_redeemed()? {
        CashState::Redeemed
    } else {
        CashState::Redeeming
    };
    Cash::pack(cash, &mut cash_link_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_close(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    let destination_info = next_account_info(account_info_iter)?;
    assert_owned_by(cash_link_info, program_id)?;

    let cash = Cash::unpack(&cash_link_info.data.borrow())?;
    assert_account_key(
        authority_info,
        &cash.authority,
        Some(CashError::InvalidAuthorityId),
    )?;
    if !cash.canceled() {
        return Err(AccountNotCanceled.into());
    }
    if cash.total_redemptions > 0 {
        return Err(AccountAlreadyRedeemed.into());
    }
    msg!("Closing the cash account...");
    empty_account_balance(cash_link_info, destination_info)?;
    Ok(())
}
