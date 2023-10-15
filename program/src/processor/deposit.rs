//! Init pass instruction processing

use crate::{
    error::CashError,
    instruction::DepositArgs,
    utils::*,
    state::{FLAG_ACCOUNT_SIZE, deposit::Deposit},
};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    msg
};

use spl_token::state::Account;

/// Process InitPass instruction
pub fn init(program_id: &Pubkey, accounts: &[AccountInfo], args: DepositArgs) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_info = next_account_info(account_info_iter)?;
    let payer_info = next_account_info(account_info_iter)?;
    let deposit_info = next_account_info(account_info_iter)?;
    let source_token_info = next_account_info(account_info_iter)?;
    let collection_token_info = next_account_info(account_info_iter)?;
    let collection_fee_token_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;

    assert_signer(user_info)?;

    if deposit_info.lamports() > 0 && !deposit_info.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    assert_owned_by(source_token_info, &spl_token::id())?;
    let source_token: Account = assert_initialized(source_token_info)?;
    assert_token_owned_by(&source_token, user_info.key)?;
    if source_token.mint != *mint_info.key {
        return Err(CashError::InvalidMint.into());
    }
    assert_owned_by(collection_token_info, &spl_token::id())?;
    let collection_token: Account = assert_initialized(collection_token_info)?;
    if collection_token.mint != *mint_info.key {
        return Err(CashError::InvalidMint.into());
    }
    assert_owned_by(collection_fee_token_info, &spl_token::id())?;
    let collection_fee_token: Account = assert_initialized(collection_fee_token_info)?;
    if collection_fee_token.mint != *mint_info.key {
        return Err(CashError::InvalidMint.into());
    }
    msg!("Assertion ok {}", collection_fee_token_info.key);

    transfer(false, source_token_info, collection_token_info, user_info, args.amount, &[])?;
    transfer(false, source_token_info, collection_fee_token_info, user_info, args.fee, &[])?;

    create_new_account_raw(
        program_id,
        deposit_info,
        rent_info,
        payer_info,
        system_account_info,
        FLAG_ACCOUNT_SIZE,
        &[
            Deposit::PREFIX.as_bytes(),
            args.reference.as_bytes(),
            &[args.bump],
        ],
    )?;
    let mut funding = Deposit::unpack_unchecked(&deposit_info.data.borrow())?;
    if funding.is_initialized() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    funding.is_initialized = true;
    Deposit::pack(funding, *deposit_info.data.borrow_mut())?;
    Ok(())
}
