pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod utils;
pub mod math;


#[cfg(not(feature = "no-entrypoint"))]
pub mod entrypoint;

use solana_program::{declare_id, pubkey::Pubkey};
use state::{cashlink::CashLink, redemption::Redemption};

declare_id!("cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q");


/// Generates cash link program address
pub fn find_cash_link_program_address(program_id: &Pubkey, reference: String) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            CashLink::PREFIX.as_bytes(),
            reference.as_bytes()
        ],
        program_id,
    )
}

pub fn find_cash_link_redemption_program_address(program_id: &Pubkey, cash_link: &Pubkey, reference: String) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            Redemption::PREFIX.as_bytes(),
            cash_link.as_ref(),
            reference.as_bytes()
        ],
        program_id,
    )
}