pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod utils;
pub mod math;


#[cfg(not(feature = "no-entrypoint"))]
pub mod entrypoint;

use solana_program::{declare_id, pubkey::Pubkey};
use state::cash::Cash;

declare_id!("cashXAE5UP18RyU7ByFWfxu93kGg69KzoktacNQDukW");


/// Generates cash link program address
pub fn find_cash_link_program_address(program_id: &Pubkey, pass_key: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            Cash::PREFIX.as_bytes(),
            pass_key.as_ref()
        ],
        program_id,
    )
}