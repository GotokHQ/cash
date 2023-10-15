//! Instruction types
#![allow(missing_docs)]

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program, sysvar,
};

/// Initialize a cash_link arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash_link params
pub struct InitCashLinkArgs {
    pub amount: u64,
    pub fee: u64,
    pub cash_link_bump: u8,
    pub vault_bump: u8,
    pub reference: String,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone,)]
pub enum CashInstruction {

    /// Starts the trade by creating and populating an cash_link account and transferring ownership of the given temp token account to the PDA
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]`   The cash_link authority responsible for approving / refunding payments due to some external conditions
    /// 1. `[]`         The account of the wallet owner initializing the cashlink
    /// 2. `[signer]`   The fee payer
    /// 3. `[writable]` The cash_link account, it will hold all necessary info about the trade.
    /// 4. `[writable]` The vault token account that holds the token amount
    /// 5. `[]` The token mint
    /// 6. `[]` The rent sysvar
    /// 7. `[]` The system program
    /// 8. `[]` The token program
    InitCashLink (InitCashLinkArgs),
    /// Settle the payment
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The destination token account for the token they will receive should the trade go through
    /// 2. `[writable]` The fee token account for the token they will receive should the trade go through
    /// 3. `[writable]` The vault token account to get tokens from and eventually close
    /// 4. `[writable]` The cash_link account holding the cash_link info
    /// 5. `[writable]` The payer token account of the payer that initialized the cash_link  
    /// 6. `[writable][signer]` The fee payer token account to receive tokens from the vault
    /// 7. `[]` The token mint
    /// 8. `[]` The clock account
    /// 9. `[]` The token program
    /// 10. `[]` The system program
    Settle,
    /// Cancel the cash_link
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash_link account holding the cash_link info   
    /// 2. `[writable]` The payer token account of the payer that initialized the cash_link  
    /// 3. `[writable]` The vault token account to get tokens from and eventually close
    /// 4. `[writable][signer]` The fee payer token account to receive tokens from the vault
    /// 4. `[]` The token mint 
    /// 5. `[]` The clock account
    /// 6. `[]` The token program
    /// 7. `[]` The system program
    Cancel,
    /// Close the cash_link
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash_link account holding the cash_link info     
    /// 2. `[writable]` The fee payer's main account to send their rent fees to
    Close,
}

/// Create `InitCashLink` instruction
pub fn init_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    payer: &Pubkey,
    fee_payer: &Pubkey,
    cash_link: &Pubkey,
    vault_token: &Pubkey,
    mint: &Pubkey,
    args: InitCashLinkArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*payer, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::InitCashLink(args),
        accounts,
    )
}

/// Create `CancelCashLink` instruction
pub fn cancel_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    cash_link: &Pubkey,
    payer_token: &Pubkey,
    vault_token: &Pubkey,
    fee_payer: &Pubkey,
    mint: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*payer_token, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Cancel,
        accounts,
    )
}

/// Create `SettleCashLink` instruction
pub fn settle_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    destination_token: &Pubkey,
    collection_fee_token: &Pubkey,
    vault_token: &Pubkey,
    cash_link: &Pubkey,
    mint: &Pubkey,
    payer_token: &Pubkey,
    fee_payer: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*destination_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*payer_token, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Settle,
        accounts,
    )
}

/// Create `CloseCashLink` instruction
pub fn close_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    cash_link: &Pubkey,
    fee_payer: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*fee_payer, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Close,
        accounts,
    )
}