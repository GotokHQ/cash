pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod utils;


#[cfg(not(feature = "no-entrypoint"))]
pub mod entrypoint;

use solana_program::{declare_id, pubkey::Pubkey};
use state::cashlink::CashLink;

declare_id!("cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q");


/// Generates cash link program address
pub fn find_cash_link_program_address(program_id: &Pubkey, reference: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            CashLink::PREFIX.as_bytes(),
            reference.as_ref()
        ],
        program_id,
    )
}