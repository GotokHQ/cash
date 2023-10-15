pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod utils;

pub const PREFIX: &str = "card";

#[cfg(not(feature = "no-entrypoint"))]
pub mod entrypoint;

use solana_program::{declare_id, pubkey::Pubkey};
use state::{deposit::Deposit, withdraw::Withdraw, escrow::Escrow};

declare_id!("cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q");

/// Generates program authority
pub fn find_program_authority(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PREFIX.as_bytes(), program_id.as_ref()], program_id)
}

/// Generates vault program address
pub fn find_vault_program_address(program_id: &Pubkey, escrow: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            PREFIX.as_bytes(),
            program_id.as_ref(),
            escrow.as_ref(),
            Escrow::VAULT_PREFIX.as_bytes(),
        ],
        program_id,
    )
}

/// Generates deposit program address
pub fn find_deposit_program_address(program_id: &Pubkey, reference: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            PREFIX.as_bytes(),
            program_id.as_ref(),
            reference.as_ref(),
            Deposit::PREFIX.as_bytes(),
        ],
        program_id,
    )
}

/// Generates withraw program address
pub fn find_withdrawal_program_address(program_id: &Pubkey, reference: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            PREFIX.as_bytes(),
            program_id.as_ref(),
            reference.as_ref(),
            Withdraw::PREFIX.as_bytes(),
        ],
        program_id,
    )
}

/// Generates escrow program address
pub fn find_escrow_program_address(program_id: &Pubkey, reference: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            PREFIX.as_bytes(),
            program_id.as_ref(),
            reference.as_ref(),
            Escrow::PREFIX.as_bytes(),
        ],
        program_id,
    )
}