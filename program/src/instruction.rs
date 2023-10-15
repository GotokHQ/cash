//! Instruction types
#![allow(missing_docs)]

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program, sysvar,
};

/// Initialize a funding arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a funding params
pub struct DepositArgs {
    pub amount: u64,
    pub fee: u64,
    pub bump: u8,
    pub reference: String,
}

/// Initialize a funding arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a funding params
pub struct WithdrawArgs {
    pub amount: u64,
    pub fee: u64,
    pub bump: u8,
    pub reference: String,
}

/// Initialize a escrow arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a escrow params
pub struct InitEscrowArgs {
    pub amount: u64,
    pub fee: u64,
    pub escrow_bump: u8,
    pub vault_bump: u8,
    pub reference: String,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone,)]
pub enum CashInstruction {
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the user initializing the fund
    /// 1. `[signer]` The authority responsible for approving due to some external conditions
    /// 2. `[signer]` The fee payer
    /// 3. `[writable]` The deposit account, it will hold all necessary info about the transaction.
    /// 4. `[writable]` The source token account that will fund the transaction
    /// 5. `[]` The token mint
    /// 6. `[]` The rent sysvar
    /// 7. `[]` The token program
    InitDeposit(DepositArgs),

    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the wallet owner
    /// 1. `[signer]` The authority responsible for approving due to some external conditions
    /// 2. `[signer]` The fee payer
    /// 3. `[writable]` The withdraw account, it will hold all necessary info about the transaction.
    /// 4. `[writable]` The source token account that will send the refund
    /// 5. `[writable]` The destination token account that will receive the refund
    /// 6. `[writable]` The source token account that will send the refund
    /// 7. `[]` The token mint
    /// 8. `[]` The rent sysvar
    /// 9. `[]` The token program
    InitWithdrawal(WithdrawArgs),
    /// Starts the trade by creating and populating an escrow account and transferring ownership of the given temp token account to the PDA
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]`   The escrow authority responsible for approving / refunding payments due to some external conditions
    /// 1. `[]`         The account of the wallet owner initializing the escrow
    /// 2. `[signer]`   The fee payer
    /// 3. `[writable]` The escrow account, it will hold all necessary info about the trade.
    /// 4. `[writable]` The vault token account that holds the token amount
    /// 5. `[]` The token mint
    /// 6. `[]` The rent sysvar
    /// 7. `[]` The system program
    /// 8. `[]` The token program
    InitEscrow (InitEscrowArgs),
    /// Settle the payment
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The destination token account for the token they will receive should the trade go through
    /// 2. `[writable]` The fee token account for the token they will receive should the trade go through
    /// 3. `[writable]` The vault token account to get tokens from and eventually close
    /// 4. `[writable]` The escrow account holding the escrow info
    /// 5. `[writable]` The payer token account of the payer that initialized the escrow  
    /// 6. `[writable][signer]` The fee payer token account to receive tokens from the vault
    /// 7. `[]` The token mint
    /// 8. `[]` The clock account
    /// 9. `[]` The token program
    /// 10. `[]` The system program
    Settle,
    /// Cancel the escrow
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The escrow account holding the escrow info   
    /// 2. `[writable]` The payer token account of the payer that initialized the escrow  
    /// 3. `[writable]` The vault token account to get tokens from and eventually close
    /// 4. `[writable][signer]` The fee payer token account to receive tokens from the vault
    /// 4. `[]` The token mint 
    /// 5. `[]` The clock account
    /// 6. `[]` The token program
    /// 7. `[]` The system program
    Cancel,
    /// Close the escrow
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The escrow account holding the escrow info     
    /// 2. `[writable]` The fee payer's main account to send their rent fees to
    Close,
}

/// Create `Deposit` instruction
pub fn deposit(
    program_id: &Pubkey,
    user: &Pubkey,
    payer: &Pubkey,
    deposit: &Pubkey,
    source_token: &Pubkey,
    collection_token: &Pubkey,
    collection_fee_token: &Pubkey,
    mint: &Pubkey,
    args: DepositArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*user, true),
        AccountMeta::new(*payer, true),
        AccountMeta::new(*deposit, false),
        AccountMeta::new(*source_token, false),
        AccountMeta::new(*collection_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    Instruction::new_with_borsh(*program_id, &CashInstruction::InitDeposit(args), accounts)
}

/// Create `Withdraw` instruction
pub fn withdraw(
    program_id: &Pubkey,
    wallet: &Pubkey,
    payer: &Pubkey,
    withdraw: &Pubkey,
    source_token: &Pubkey,
    destination_token: &Pubkey,
    collection_fee_token: &Pubkey,
    mint: &Pubkey,
    args: WithdrawArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*wallet, true),
        AccountMeta::new(*payer, true),
        AccountMeta::new(*withdraw, false),
        AccountMeta::new(*source_token, false),
        AccountMeta::new(*destination_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::InitWithdrawal(args),
        accounts,
    )
}

/// Create `InitEscrow` instruction
pub fn init_escrow(
    program_id: &Pubkey,
    authority: &Pubkey,
    payer: &Pubkey,
    fee_payer: &Pubkey,
    escrow: &Pubkey,
    vault_token: &Pubkey,
    mint: &Pubkey,
    args: InitEscrowArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*payer, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*escrow, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::InitEscrow(args),
        accounts,
    )
}

/// Create `CancelEscrow` instruction
pub fn cancel_escrow(
    program_id: &Pubkey,
    authority: &Pubkey,
    escrow: &Pubkey,
    payer_token: &Pubkey,
    vault_token: &Pubkey,
    fee_payer: &Pubkey,
    mint: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*escrow, false),
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

/// Create `SettleEscrow` instruction
pub fn settle_escrow(
    program_id: &Pubkey,
    authority: &Pubkey,
    destination_token: &Pubkey,
    collection_fee_token: &Pubkey,
    vault_token: &Pubkey,
    escrow: &Pubkey,
    mint: &Pubkey,
    payer_token: &Pubkey,
    fee_payer: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*destination_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new(*escrow, false),
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

/// Create `CloseEscrow` instruction
pub fn close_escrow(
    program_id: &Pubkey,
    authority: &Pubkey,
    escrow: &Pubkey,
    fee_payer: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*escrow, false),
        AccountMeta::new(*fee_payer, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Close,
        accounts,
    )
}