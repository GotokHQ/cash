//! Init pass instruction processing

use crate::{
    error::CashError,
    instruction::WithdrawArgs,
    state::{FLAG_ACCOUNT_SIZE, withdraw::Withdraw},
    utils::*,
};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
};

use spl_token::state::Account;

/// Process InitPass instruction
pub fn init(program_id: &Pubkey, accounts: &[AccountInfo], args: WithdrawArgs) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let wallet_info = next_account_info(account_info_iter)?;
    let payer_info = next_account_info(account_info_iter)?;
    let withdraw_info = next_account_info(account_info_iter)?;
    let source_token_info = next_account_info(account_info_iter)?;
    let destination_token_info = next_account_info(account_info_iter)?;
    let collection_fee_token_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;

    assert_signer(wallet_info)?;
    if withdraw_info.lamports() > 0 && !withdraw_info.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    assert_owned_by(source_token_info, &spl_token::id())?;
    let source_token: Account = assert_initialized(source_token_info)?;
    if source_token.mint != *mint_info.key {
        return Err(CashError::InvalidMint.into());
    }
    assert_owned_by(destination_token_info, &spl_token::id())?;
    let destination_token: Account = assert_initialized(destination_token_info)?;
    assert_token_owned_by(&source_token, wallet_info.key)?;
    if destination_token.mint != *mint_info.key {
        return Err(CashError::InvalidMint.into());
    }
    assert_owned_by(collection_fee_token_info, &spl_token::id())?;
    let collection_fee_token: Account = assert_initialized(collection_fee_token_info)?;

    if collection_fee_token.mint != *mint_info.key {
        return Err(CashError::InvalidMint.into());
    }

    transfer(false, source_token_info, destination_token_info, wallet_info, args.amount, &[])?;
    transfer(false, source_token_info, collection_fee_token_info, wallet_info, args.fee, &[])?;


    create_new_account_raw(
        program_id,
        withdraw_info,
        rent_info,
        payer_info,
        system_account_info,
        FLAG_ACCOUNT_SIZE,
        &[
            Withdraw::PREFIX.as_bytes(),
            args.reference.as_bytes(),
            &[args.bump],
        ],
    )?;
    let mut withdraw = Withdraw::unpack_unchecked(&withdraw_info.data.borrow())?;
    if withdraw.is_initialized() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    withdraw.is_initialized = true;
    Withdraw::pack(withdraw, *withdraw_info.data.borrow_mut())?;
    Ok(())
}
