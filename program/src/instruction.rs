//! Instruction types
#![allow(missing_docs)]

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program, sysvar,
};
use spl_associated_token_account::get_associated_token_address;

/// Initialize a cash_link arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash_link params
pub struct InitCashLinkArgs {
    pub amount: u64,
    pub fee: u64,
    pub cash_link_bump: u8,
    pub pay: bool
}

/// Initialize a redemption arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash_link params
pub struct InitCashRedemptionArgs {
    pub bump: u8,
    pub reference: String
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
    /// 1. `[signer][writable]`The account of the wallet owner initializing the cashlink
    /// 2. `[signer]`   The fee payer
    /// 3. `[writable]` The cash link account, it will hold all necessary info about the trade.
    /// 4. `[]` The reference
    /// 5. `[]` The rent sysvar
    /// 6. `[]` The system program
    /// 7. `[]` The token mint (Optional)
    /// 8. `[writable]` The associated token for the mint derived from the cash link account (Optional)
    /// 10. `[writable]` The sender token that must be passed if pay is true and mint is some Optional)
    /// 11. `[]` The token program
    InitCashLink (InitCashLinkArgs),
    /// Redeem the cashlink
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[signer]` The account of the recipient
    /// 2. `[writable]` The fee token account for the token they will receive should the trade go through
    /// 3. `[writable]` The cash_link account holding the cash_link info
    /// 4. `[writable]` The redemption account to flag a user has redeemed this cashlink
    /// 5. `[writable]` The payer token account of the payer that initialized the cash_link  
    /// 6. `[writable]` The fee payer token account to receive tokens from the vault
    /// 7. `[]` The clock account
    /// 8. `[]` The rent account
    /// 9. `[writable][Optional]` The vault token account to get tokens. This value is Optional. if the mint is set, then this must be set.
    /// 10. `[writable][Optional]` The recipient token account for the token they will receive should the trade go through
    /// 11. `[]` The system program
    /// 12. `[]` The token program
    Redeem(InitCashRedemptionArgs),
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
    let sender_key = if args.pay {
        if mint.is_some() {
            AccountMeta::new_readonly(*sender, true)
        } else {
            AccountMeta::new(*sender, true)
        }
    } else {
        AccountMeta::new_readonly(*sender, false)
    };
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        sender_key,
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new_readonly(*reference, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];
    if let Some(key) = mint {
        let associated_token_account = get_associated_token_address(cash_link, &key);
        accounts.push(AccountMeta::new_readonly(*key, false));
        accounts.push(AccountMeta::new(associated_token_account, false));
        let sender_token_account = get_associated_token_address(sender, &key);
        accounts.push(AccountMeta::new(sender_token_account, false));
        accounts.push(AccountMeta::new_readonly(spl_associated_token_account::id(), false),);
    }
    accounts.push(AccountMeta::new(spl_token::id(), false));
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
    recipient_wallet: &Pubkey,
    recipient_token: &Pubkey,
    collection_fee_token: &Pubkey,
    vault_token: Option<&Pubkey>,
    cash_link: &Pubkey,
    redemption_pda: &Pubkey,
    sender_token: &Pubkey,
    fee_payer: &Pubkey,
    args: InitCashRedemptionArgs
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*recipient_wallet, true),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*redemption_pda, false),
        AccountMeta::new(*sender_token, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
    ];

    if let Some(key) = vault_token {
        accounts.push(AccountMeta::new(*recipient_token, false));
        accounts.push(AccountMeta::new(*key, false));
    }
    accounts.push(AccountMeta::new_readonly(system_program::id(), false));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Redeem(args),
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