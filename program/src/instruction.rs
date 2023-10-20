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
    /// 4. `[]` The reference
    /// 5. `[]` The rent sysvar
    /// 6. `[]` The system program
    /// 7. `[]` The token program
    /// 8. `[]` The token mint (Optional)
    InitCashLink (InitCashLinkArgs),
    /// Redeem the cashlink
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The recipient token account for the token they will receive should the trade go through
    /// 2. `[writable]` The fee token account for the token they will receive should the trade go through
    /// 3. `[writable]` The cash_link account holding the cash_link info
    /// 4. `[writable]` The payer token account of the payer that initialized the cash_link  
    /// 5. `[writable]` The fee payer token account to receive tokens from the vault
    /// 6. `[]` The clock account
    /// 7. `[]` The rent account
    /// 8. `[writable]` The vault token account to get tokens. This value is Optional. if the mint is set, then this must be set.
    /// 9. `[]` The token program
    /// 10. `[]` The system program
    Redeem,
    /// Cancel the cash_link
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash_link account holding the cash_link info   
    /// 2. `[writable]` The payer token account of the payer that initialized the cash_link  
    /// 3. `[writable]` The fee payer token account to receive tokens from the vault
    /// 4. `[]` The clock account
    /// 5. `[]` The rent account
    /// 6. `[writable]` The vault token account to get tokens from and eventually close. This value is Optional. if the mint is set, then this must be set.
    /// 7. `[]` The token program
    /// 8. `[]` The system program
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
    sender: &Pubkey,
    fee_payer: &Pubkey,
    cash_link: &Pubkey,
    reference: &Pubkey,
    mint: Option<&Pubkey>,
    args: InitCashLinkArgs,
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*sender, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new_readonly(*reference, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];
    if let Some(key) = mint {
        accounts.push(AccountMeta::new_readonly(*key, false));
    }
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
    sender_token: &Pubkey,
    vault_token: Option<&Pubkey>,
    fee_payer: &Pubkey,
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*sender_token, false),
        AccountMeta::new(*fee_payer, false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
    ];

    if let Some(key) = vault_token {
        accounts.push(AccountMeta::new(*key, false));
    }

    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new_readonly(system_program::id(), false));

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Cancel,
        accounts,
    )
}

/// Create `RedeemCashLink` instruction
pub fn redeem_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    recipient_token: &Pubkey,
    collection_fee_token: &Pubkey,
    vault_token: Option<&Pubkey>,
    cash_link: &Pubkey,
    sender_token: &Pubkey,
    fee_payer: &Pubkey,
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*recipient_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*sender_token, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
    ];

    if let Some(key) = vault_token {
        accounts.push(AccountMeta::new(*key, false));
    }

    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new_readonly(system_program::id(), false));

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Redeem,
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