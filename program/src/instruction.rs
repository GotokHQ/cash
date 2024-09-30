//! Instruction types
#![allow(missing_docs)]

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program, sysvar,
};
use spl_associated_token_account::get_associated_token_address_with_program_id;

use crate::state::cash::DistributionType;

/// Initialize a cash arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash params
pub struct InitCashArgs {
    pub amount: u64,
    pub fee_bps: u16,
    pub network_fee: u64,
    pub base_fee_to_redeem: u64,
    pub rent_fee_to_redeem: u64,
    pub cash_bump: u8,
    pub distribution_type: DistributionType,
    pub max_num_redemptions: u16,
    pub min_amount: Option<u64>,
    pub cash_reference: String,
    pub is_locked: bool,
}

/// Initialize a redemption arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash params
pub struct InitCashRedemptionArgs {
    pub cash_bump: u8,
    pub cash_reference: String,
    pub fingerprint_bump: Option<u8>,
    pub referrer_fee_bps:  Option<u16>,
    pub referee_fee_bps:  Option<u16>,
    pub weight_ppm: Option<u32>,
    pub rate_usd: Option<String>,
}

/// Cancel a cash link
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Cancel a cash params
pub struct CancelCashRedemptionArgs {
    pub cash_bump: u8,
    pub cash_reference: String,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone,)]
pub enum CashInstruction {

    /// Starts the trade by creating and populating an cash account and transferring ownership of the given temp token account to the PDA
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]`   The cash authority responsible for approving / refunding payments due to some external conditions
    /// 1. `[signer][writable]`The account of the wallet owner initializing the cash
    /// 2. `[signer]`   The fee payer
    /// 3. `[writable]` The cash link account, it will hold all necessary info about the trade.
    /// 4. `[]` The pass key required to unlock the cash link for redemption (Optional)
    /// 5. `[]` The token mint
    /// 6. `[writable]` The associated token for the mint derived from the cash link account
    /// 7. `[writable]` The owner token that must be passed if pay is true and mint is some
    /// 8. `[]` The rent sysvar
    /// 9. `[]` The system program
    /// 10. `[]` The token program
    /// 11. `[]` The associated token program
    InitCash (InitCashArgs),
    /// Redeem the cash
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[]` The user wallet
    /// 2. `[writable]` The platform fee account for the token they will receive should the trade go through
    /// 3. `[writable]` The cash account holding the cash info
    /// 4. `[signer]` The pass key required to unlock the cash link for redemption (optional)
    /// 5. `[writable]` The payer token account of the payer that initialized the cash  
    /// 6. `[writable]` The fee payer account that pays network and rent fees
    /// 7. `[writable]` The fee payer's associated token account that collects the rent or network fees
    /// 8. `[writable]` The vault token account to get tokens. This value is Optional. if the mint is set, then this must be set.
    /// 9. `[writable]` The recipient token account for the token they will receive should the trade go through
    /// 10. `[]` The mint account for the token
    /// 11. `[]` The rent account
    /// 12. `[]` The recent slot hash account
    /// 13. `[]` The token program
    /// 14. `[writable][Optional]` The referrer wallet account
    /// 15. `[writable][Optional]` The referrer token account
    /// 16. `[]` The associated program
    Redeem(InitCashRedemptionArgs),
    /// Cancel the cash
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash account holding the cash info   
    /// 2. `[writable]` The owner associated token account of the owner if it's not a native mint
    /// 3. `[writable]` The fee payer token account to receive tokens from the vault
    /// 4. `[writable]` The vault token account to get tokens from and eventually close. This value is Optional. if the mint is set, then this must be set.
    /// 5. `[]` The token program
    /// 6. `[]` The system program   
    Cancel(CancelCashRedemptionArgs),
    /// Close the cash
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash account holding the cash info     
    /// 2. `[writable]` The destination account to send their rent fees to
    Close,
}

/// Create `InitCash` instruction
pub fn init_cash(
    program_id: &Pubkey,
    authority: &Pubkey,
    owner: &Pubkey,
    fee_payer: &Pubkey,
    cash_link_pda: &Pubkey,
    pass_key: &Pubkey,
    mint: &Pubkey,
    token_program_id: &Pubkey,
    args: InitCashArgs,
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
        AccountMeta::new_readonly(*token_program_id, false),
        AccountMeta::new(get_associated_token_address_with_program_id(cash_link_pda, &mint, token_program_id), false),
        AccountMeta::new(get_associated_token_address_with_program_id(owner, &mint, token_program_id), false),     
        AccountMeta::new_readonly(spl_associated_token_account::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::InitCash(args),
        accounts,
    )
}

/// Create `CancelCash` instruction
pub fn cancel_cash(
    program_id: &Pubkey,
    authority: &Pubkey,
    cash: &Pubkey,
    pass_key: &Pubkey,
    owner_token: &Pubkey,
    vault_token: &Pubkey,
    mint: &Pubkey,
    fee_payer: &Pubkey,
    token_program_id: &Pubkey,
    args: CancelCashRedemptionArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash, false),
        AccountMeta::new_readonly(*pass_key, false),
        AccountMeta::new(*owner_token, false),
        AccountMeta::new(*fee_payer, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(*token_program_id, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Cancel(args),
        accounts,
    )
}

/// Create `RedeemCash` instruction
pub fn redeem_cash(
    program_id: &Pubkey,
    authority: &Pubkey,
    wallet: &Pubkey,
    wallet_token: &Pubkey,
    collection_fee_token: &Pubkey,
    vault_token: &Pubkey,
    cash: &Pubkey,
    pass_key: Option<&Pubkey>, // pass_key is now optional
    owner_token: &Pubkey,
    fee_payer: &Pubkey,
    fee_payer_token: &Pubkey,
    referral_wallet: Option<&Pubkey>,
    referral_token: Option<&Pubkey>,
    mint: &Pubkey,
    token_program_id: &Pubkey,
    args: InitCashRedemptionArgs
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*wallet, true),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new(*cash, false),
        AccountMeta::new(*owner_token, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*fee_payer_token, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new(*wallet_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(sysvar::slot_hashes::id(), false),
        AccountMeta::new_readonly(*token_program_id, false),
    ];

    // Add pass_key if it's Some, otherwise continue with next accounts
    if let Some(pass_key_account) = pass_key {
        accounts.insert(4, AccountMeta::new_readonly(*pass_key_account, false)); // Insert pass_key after cash
    }

    // Add referral wallet if provided
    if let Some(referral) = referral_wallet {
        accounts.push(AccountMeta::new(*referral, false));
    }

    // Add referral token if provided
    if let Some(referral_token_account) = referral_token {
        accounts.push(AccountMeta::new(*referral_token_account, false));
    }

    // Include associated token program ID
    accounts.push(AccountMeta::new_readonly(spl_associated_token_account::id(), false));

    // Construct and return the instruction
    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Redeem(args),
        accounts,
    )
}


/// Create `Close` instruction
pub fn close_cash(
    program_id: &Pubkey,
    authority: &Pubkey,
    cash: &Pubkey,
    destination: &Pubkey
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash, false),
        AccountMeta::new(*destination, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Close,
        accounts,
    )
}