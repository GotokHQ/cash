//! Instruction types
#![allow(missing_docs)]

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program, sysvar,
};
use spl_associated_token_account::get_associated_token_address;

use crate::state::cashlink::DistributionType;

/// Initialize a cash_link arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash_link params
pub struct InitCashLinkArgs {
    pub amount: u64,
    pub fee_bps: u16,
    pub network_fee: u64,
    pub base_fee_to_redeem: u64,
    pub rent_fee_to_redeem: u64,
    pub cash_link_bump: u8,
    pub distribution_type: DistributionType,
    pub max_num_redemptions: u16,
    pub min_amount: Option<u64>,
    pub fingerprint_enabled: Option<bool>,
    pub num_days_to_expire: u8,
}

/// Initialize a redemption arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash_link params
pub struct InitCashRedemptionArgs {
    pub redemption_bump: u8,
    pub cash_link_bump: u8,
    pub fingerprint: Option<String>,
    pub fingerprint_bump: Option<u8>,
}

/// Cancel a cash link
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Cancel a cash_link params
pub struct CancelCashRedemptionArgs {
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
    /// 1. `[signer][writable]`The account of the wallet owner initializing the cashlink
    /// 2. `[signer]`   The fee payer
    /// 3. `[writable]` The cash link account, it will hold all necessary info about the trade.
    /// 4. `[]` The pass key required to unlock the cash link for redemption
    /// 5. `[]` The token mint
    /// 6. `[writable]` The associated token for the mint derived from the cash link account
    /// 7. `[writable]` The owner token that must be passed if pay is true and mint is some
    /// 8. `[]` The rent sysvar
    /// 9. `[]` The system program
    /// 10. `[]` The clock account
    /// 11. `[]` The token program
    /// 12. `[]` The associated token program
    InitCashLink (InitCashLinkArgs),
    /// Redeem the cashlink
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[signer]` The user wallet
    /// 2. `[writable]` The platform fee account for the token they will receive should the trade go through
    /// 3. `[writable]` The cash_link account holding the cash_link info
    /// 4. `[]` The pass key required to unlock the cash link for redemption
    /// 5. `[writable]` The redemption account to flag a user has redeemed this cashlink
    /// 6. `[writable]` The payer token account of the payer that initialized the cash_link  
    /// 7. `[writable]` The fee payer account that pays network and rent fees
    /// 8. `[writable]` The fee payer's associated token account that collects the rent or network fees
    /// 9. `[writable]` The vault token account to get tokens. This value is Optional. if the mint is set, then this must be set.
    /// 10. `[writable]` The recipient token account for the token they will receive should the trade go through
    /// 11. `[]` The mint account for the token
    /// 12. `[]` The clock account
    /// 13. `[]` The rent account
    /// 14. `[]` The recent slot hash account
    /// 15. `[]` The system program
    /// 16. `[writable][Optional]` The fingerprint info
    /// 17. `[]` The token program
    /// 18. `[]` The associated program
    Redeem(InitCashRedemptionArgs),
    /// Cancel the cash_link
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash_link account holding the cash_link info   
    /// 2. `[]` The pass key required to unlock the cash link for redemption    
    /// 3. `[writable]` The owner or wallet that created the cash link
    /// 4. `[writable]` The owner associated token account of the owner
    /// 5. `[writable]` The fee payer token account to receive tokens from the vault
    /// 6. `[]` The clock account
    /// 7. `[]` The rent account
    /// 8. `[writable]` The vault token account to get tokens from and eventually close. This value is Optional. if the mint is set, then this must be set.
    /// 9. `[]` The token program
    /// 10. `[]` The system program
    Cancel(CancelCashRedemptionArgs),
    /// Close the cash_link
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash_link account holding the cash_link info     
    /// 2. `[writable]` The destination account to send their rent fees to
    Close,
}

/// Create `InitCashLink` instruction
pub fn init_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    owner: &Pubkey,
    fee_payer: &Pubkey,
    cash_link_pda: &Pubkey,
    pass_key: &Pubkey,
    mint: &Pubkey,
    args: InitCashLinkArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*owner, true),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*cash_link_pda, false),
        AccountMeta::new_readonly(*pass_key, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new(get_associated_token_address(cash_link_pda, &mint), false),
        AccountMeta::new(get_associated_token_address(owner, &mint), false),        
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(spl_associated_token_account::id(), false),
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
    pass_key: &Pubkey,
    owner: &Pubkey,
    owner_token: &Pubkey,
    vault_token: &Pubkey,
    fee_payer: &Pubkey,
    args: CancelCashRedemptionArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new_readonly(*pass_key, false),
        AccountMeta::new_readonly(*owner, false),
        AccountMeta::new(*owner_token, false),
        AccountMeta::new(*fee_payer, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(system_program::id(), false)
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Cancel(args),
        accounts,
    )
}

/// Create `RedeemCashLink` instruction
pub fn redeem_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    wallet: &Pubkey,
    wallet_token: &Pubkey,
    collection_fee_token: &Pubkey,
    vault_token: &Pubkey,
    cash_link: &Pubkey,
    pass_key: &Pubkey,
    redemption_pda: &Pubkey,
    owner_token: &Pubkey,
    fee_payer: &Pubkey,
    fee_payer_token: &Pubkey,
    fingerprint: Option<&Pubkey>,
    mint: &Pubkey,
    args: InitCashRedemptionArgs
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*wallet, true),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new_readonly(*pass_key, false),
        AccountMeta::new(*redemption_pda, false),
        AccountMeta::new(*owner_token, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*fee_payer_token, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new(*wallet_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(sysvar::slot_hashes::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];
    if let Some(fingerprint_id) = fingerprint {
        accounts.push(AccountMeta::new(*fingerprint_id, false));
    }
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new_readonly(spl_associated_token_account::id(), false));

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
    destination: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*destination, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Close,
        accounts,
    )
}