use crate::{
    error::CashError::{
        self, AccountAlreadyExpired, AccountAlreadyRedeemed, AccountNotExpired,
        InsufficientSettlementFunds,
    },
    instruction::{CancelCashRedemptionArgs, InitCashLinkArgs, InitCashRedemptionArgs},
    math::SafeMath,
    state::{
        cashlink::{CashLink, CashLinkState, DistributionType},
        AccountType, FINGERPRINT_PREFIX, FLAG_ACCOUNT_SIZE,
    },
    utils::{
        assert_account_key, assert_initialized, assert_owned_by, assert_signer,
        assert_token_owned_by, calculate_fee, create_associated_token_account_raw,
        create_new_account_raw, empty_account_balance, exists, get_random_value,
        spl_token_close, spl_token_transfer,
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
    let owner_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    let pass_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;
    let owner_token_info = next_account_info(account_info_iter)?;
    //let vault_token_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;

    let clock = &Clock::from_account_info(clock_info)?;

    msg!("Start to read the mint info for the cashlink");
    let mut cash_link = create_cash_link(
        program_id,
        cash_link_info,
        fee_payer_info,
        rent_info,
        system_account_info,
        &[
            CashLink::PREFIX.as_bytes(),
            pass_info.key.as_ref(),
            &[args.cash_link_bump],
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
        DistributionType::Random => args.amount,
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
    if args.num_days_to_expire == 0 {
        return Err(CashError::InvalidExpiryInDays.into());
    }
    let now = clock.unix_timestamp as u64;
    let total = total_amount
        .checked_add(total_platform_fee)
        .ok_or::<ProgramError>(CashError::Overflow.into())?
        .checked_add(total_redemption_fee)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;
    cash_link.account_type = AccountType::CashLink;
    cash_link.state = CashLinkState::Initialized;
    cash_link.amount = total_amount;
    cash_link.fee_bps = args.fee_bps;
    cash_link.base_fee_to_redeem = args.base_fee_to_redeem;
    cash_link.rent_fee_to_redeem = args.rent_fee_to_redeem;
    cash_link.network_fee = args.network_fee;
    cash_link.remaining_amount = total_amount;
    cash_link.authority = *authority_info.key;
    cash_link.pass_key = *pass_info.key;
    cash_link.owner = *owner_info.key;
    cash_link.distribution_type = args.distribution_type;
    cash_link.max_num_redemptions = args.max_num_redemptions;
    cash_link.fingerprint_enabled = match args.fingerprint_enabled {
        Some(enabled) => enabled,
        None => false,
    };
    cash_link.expires_at = now + (args.num_days_to_expire as u64 * 86400);
    cash_link.min_amount = match args.min_amount {
        Some(amount) if amount > total_amount => {
            return Err(CashError::MinAmountMustBeLessThanAmount.into())
        }
        Some(amount) => amount,
        None => 1,
    };
    cash_link.mint = *mint_info.key;
    let associated_token_account =
        get_associated_token_address(&cash_link_info.key, &mint_info.key);
    // let vault_token: TokenAccount = assert_initialized(associated_token_account)?;
    // assert_token_owned_by(&vault_token, cash_link_info.key)?;
    assert_account_key(
        vault_token_info,
        &associated_token_account,
        Some(CashError::InvalidVaultTokenOwner),
    )?;
    if exists(vault_token_info)? {
        let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
        assert_owned_by(vault_token_info, &spl_token::id())?;
        assert_token_owned_by(&vault_token, cash_link_info.key)?;
        assert_account_key(mint_info, &vault_token.mint, Some(CashError::InvalidMint))?;
    } else {
        create_associated_token_account_raw(
            fee_payer_info,
            vault_token_info,
            cash_link_info,
            mint_info,
            rent_info,
        )?;
    }
    assert_owned_by(owner_token_info, &spl_token::id())?;
    let owner_token: TokenAccount = assert_initialized(owner_token_info)?;
    assert_token_owned_by(&owner_token, owner_info.key)?;
    spl_token_transfer(owner_token_info, vault_token_info, owner_info, total, &[])?;
    //spl_token_transfer(owner_token_info, fee_token_info, owner_info, total_platform_fee, &[])?;
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
    let pass_info = next_account_info(account_info_iter)?;
    let mut cash_link = CashLink::unpack(&cash_link_info.data.borrow())?;

    assert_account_key(
        authority_info,
        &cash_link.authority,
        Some(CashError::InvalidAuthorityId),
    )?;

    assert_account_key(
        pass_info,
        &cash_link.pass_key,
        Some(CashError::InvalidPassKey),
    )?;
    let owner_token_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;

    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;

    if cash_link.expired() {
        return Err(AccountAlreadyExpired.into());
    }
    if cash_link.redeemed() {
        return Err(AccountAlreadyRedeemed.into());
    }

    if (clock.unix_timestamp as u64) <= cash_link.expires_at {
        return Err(CashError::CashlinkNotExpired.into());
    }

    let signer_seeds = [
        CashLink::PREFIX.as_bytes(),
        pass_info.key.as_ref(),
        &[args.cash_link_bump],
    ];

    let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
    // assert_account_key(vault_token.mint, mint, Some(CashError::InvalidMint))?;
    let associated_token_account =
        get_associated_token_address(&cash_link_info.key, &cash_link.mint);
    assert_account_key(
        vault_token_info,
        &associated_token_account,
        Some(CashError::InvalidVaultTokenOwner),
    )?;
    if vault_token.amount > 0 {
        let owner_token: TokenAccount = assert_initialized(owner_token_info)?;
        assert_token_owned_by(&owner_token, &cash_link.owner)?;
        spl_token_transfer(
            vault_token_info,
            owner_token_info,
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
    msg!("Mark the cash_link account as expired...");
    cash_link.state = CashLinkState::Expired;
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

    let wallet_info = next_account_info(account_info_iter)?;
    let fee_token_info = next_account_info(account_info_iter)?;
    let cash_link_info = next_account_info(account_info_iter)?;
    let pass_info = next_account_info(account_info_iter)?;

    assert_owned_by(cash_link_info, program_id)?;
    let mut cash_link = CashLink::unpack(&cash_link_info.data.borrow())?;
    assert_account_key(
        authority_info,
        &cash_link.authority,
        Some(CashError::InvalidAuthorityId),
    )?;
    assert_account_key(
        pass_info,
        &cash_link.pass_key,
        Some(CashError::InvalidPassKey),
    )?;
    assert_signer(pass_info)?;

    if cash_link.expired() {
        return Err(AccountAlreadyExpired.into());
    }
    if cash_link.redeemed() {
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
    let system_account_info = next_account_info(account_info_iter)?;
    if clock.unix_timestamp as u64 > cash_link.expires_at {
        return Err(CashError::CashlinkExpired.into());
    }
    assert_account_key(
        recent_slothashes_info,
        &slot_hashes::id(),
        Some(CashError::InvalidSlotHashProgram.into()),
    )?;

    let signer_seeds = [
        CashLink::PREFIX.as_bytes(),
        pass_info.key.as_ref(),
        &[args.cash_link_bump],
    ];

    if cash_link.total_redemptions >= cash_link.max_num_redemptions {
        return Err(CashError::MaxRedemptionsReached.into());
    }
    if cash_link.remaining_amount == 0 {
        return Err(CashError::NoRemainingAmount.into());
    }

    let amount_to_redeem = match cash_link.distribution_type {
        DistributionType::Fixed => cash_link
            .amount
            .checked_div(cash_link.max_num_redemptions as u64)
            .ok_or(CashError::Overflow)?,
        DistributionType::Random => {
            if cash_link.max_num_redemptions == 1
                || cash_link.total_redemptions == (cash_link.max_num_redemptions - 1)
            {
                cash_link.remaining_amount
            } else {
                // get slot hash
                let max_possible = cash_link
                    .remaining_amount
                    .checked_div(cash_link.max_num_redemptions as u64)
                    .and_then(|amount| amount.checked_mul(2))
                    .ok_or(CashError::Overflow)?;

                let rand =
                    get_random_value(recent_slothashes_info, clock)? as f64 / u64::MAX as f64;
                let money;

                if max_possible > cash_link.min_amount {
                    let range_amount = max_possible - cash_link.min_amount;
                    money = cash_link.min_amount + (rand * range_amount as f64) as u64;
                } else {
                    money = cash_link.min_amount;
                }
                money
            }
        }
    };

    let fee_to_redeem = cash_link.max_fee_to_redeem()?;

    cash_link.remaining_amount = cash_link
        .remaining_amount
        .checked_sub(amount_to_redeem)
        .ok_or(CashError::Overflow)?;

    cash_link.total_redemptions = cash_link.total_redemptions.error_increment()?;

    let platform_fee_per_redeem: u64 = calculate_fee(cash_link.amount, cash_link.fee_bps as u64)?
        .checked_div(cash_link.max_num_redemptions as u64)
        .ok_or(CashError::Overflow)?;

    let mut total_fee_to_redeem = if cash_link.total_redemptions == 1 {
        platform_fee_per_redeem
            .checked_add(fee_to_redeem)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
            .checked_add(cash_link.network_fee)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
    } else {
        platform_fee_per_redeem
            .checked_add(fee_to_redeem)
            .ok_or::<ProgramError>(CashError::Overflow.into())?
    };

    let mut total = amount_to_redeem
        .checked_add(total_fee_to_redeem)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;
    assert_owned_by(vault_token_info, &spl_token::id())?;
    let associated_token_account =
        get_associated_token_address(&cash_link_info.key, &cash_link.mint);
    assert_account_key(
        vault_token_info,
        &associated_token_account,
        Some(CashError::InvalidVaultTokenOwner),
    )?;
    let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
    let fee_payer_token: TokenAccount = assert_initialized(fee_payer_token_info)?;
    assert_token_owned_by(&fee_payer_token, &fee_payer_info.key)?;
    assert_owned_by(fee_payer_token_info, &spl_token::id())?;
    let _: TokenAccount = assert_initialized(fee_token_info)?;
    assert_owned_by(fee_token_info, &spl_token::id())?;
    if exists(recipient_token_info)? {
        let recipient_token: TokenAccount = assert_initialized(recipient_token_info)?;
        assert_token_owned_by(&recipient_token, &wallet_info.key)?;
        assert_owned_by(recipient_token_info, &spl_token::id())?;
        //subtract rent_fee
        total_fee_to_redeem = total_fee_to_redeem
            .checked_sub(cash_link.rent_fee_to_redeem)
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
        )?;
    }
    if vault_token.amount < total {
        return Err(InsufficientSettlementFunds.into());
    }
    spl_token_transfer(
        vault_token_info,
        recipient_token_info,
        cash_link_info,
        amount_to_redeem,
        &[&signer_seeds],
    )?;
    if platform_fee_per_redeem > 0 {
        if let Some(referrer_fee_bps) = args.referrer_fee_bps {
            let referral_wallet_info = next_account_info(account_info_iter)?;
            let referral_account_info = next_account_info(account_info_iter)?;
            if exists(referral_account_info)? {
                let referral_token: TokenAccount = assert_initialized(referral_account_info)?;
                assert_token_owned_by(&referral_token, &referral_wallet_info.key)?;
                assert_owned_by(referral_account_info, &spl_token::id())?;
            } else {
                create_associated_token_account_raw(
                    fee_payer_info,
                    referral_account_info,
                    referral_wallet_info,
                    mint_info,
                    rent_info,
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
                    platform_fee,
                    &[&signer_seeds],
                )?;
            }
            if referrer_fee > 0 {
                spl_token_transfer(
                    vault_token_info,
                    referral_account_info,
                    cash_link_info,
                    referrer_fee,
                    &[&signer_seeds],
                )?;
            }
            if referee_fee > 0 {
                spl_token_transfer(
                    vault_token_info,
                    owner_token_info,
                    cash_link_info,
                    referee_fee,
                    &[&signer_seeds],
                )?;
            }
        } else {
            spl_token_transfer(
                vault_token_info,
                fee_token_info,
                cash_link_info,
                platform_fee_per_redeem,
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
            total_network_fee,
            &[&signer_seeds],
        )?;
    }
    let remaining = vault_token
        .amount
        .checked_sub(total)
        .ok_or::<ProgramError>(CashError::Overflow.into())?;
    if cash_link.is_fully_redeemed()? {
        let owner_token: TokenAccount = assert_initialized(owner_token_info)?;
        assert_token_owned_by(&owner_token, &cash_link.owner)?;
        if remaining > 0 {
            spl_token_transfer(
                vault_token_info,
                owner_token_info,
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
    }
    if cash_link.fingerprint_enabled {
        if let Some(bump) = args.fingerprint_bump {
            if let Some(fingerprint) = args.fingerprint {
                let fingerprint_account_info = next_account_info(account_info_iter)?;
                if fingerprint_account_info.lamports() > 0
                    && !fingerprint_account_info.data_is_empty()
                {
                    return Err(ProgramError::AccountAlreadyInitialized);
                }
                create_new_account_raw(
                    program_id,
                    fingerprint_account_info,
                    rent_info,
                    fee_payer_info,
                    system_account_info,
                    FLAG_ACCOUNT_SIZE,
                    &[
                        FINGERPRINT_PREFIX.as_bytes(),
                        cash_link_info.key.as_ref(),
                        &bs58::decode(fingerprint)
                            .into_vec()
                            .map_err(|_| CashError::InvalidFingerprint)?,
                        &[bump],
                    ],
                )?;
            } else {
                return Err(CashError::FingerprintFound.into());
            }
        } else {
            return Err(CashError::FingerprintBumpNotFound.into());
        }
    }
    cash_link.state = if cash_link.is_fully_redeemed()? {
        CashLinkState::Redeemed
    } else {
        CashLinkState::Redeeming
    };
    CashLink::pack(cash_link, &mut cash_link_info.data.borrow_mut())?;
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

    let cash_link = CashLink::unpack(&cash_link_info.data.borrow())?;
    assert_account_key(
        authority_info,
        &cash_link.authority,
        Some(CashError::InvalidAuthorityId),
    )?;
    if !cash_link.expired() {
        return Err(AccountNotExpired.into());
    }
    if cash_link.total_redemptions > 0 {
        return Err(AccountAlreadyRedeemed.into());
    }
    msg!("Closing the cash_link account...");
    empty_account_balance(cash_link_info, destination_info)?;
    Ok(())
}
