use borsh::BorshDeserialize;
use crate::instruction::CashInstruction;

use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg, pubkey::Pubkey};

pub mod cashlink;


pub struct Processor;
impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        msg!("Start deserialize cash instruction");
        let instruction = CashInstruction::try_from_slice(instruction_data)?;
        msg!("Successfully deserialized cash instruction");

        match instruction {
            CashInstruction::InitCashLink(args) => {
                msg!("Instruction: InitCashLink");
                cashlink::process_init_cash_link(accounts, args, program_id)
            }
            CashInstruction::Settle => {
                msg!("Instruction: Settle CashLink");
                cashlink::process_settlement(accounts, program_id)
            }
            CashInstruction::Cancel => {
                msg!("Instruction: Cancel CashLink");
                cashlink::process_cancel(accounts, program_id)
            }
            CashInstruction::Close => {
                msg!("Instruction: Close");
                cashlink::process_close(accounts, program_id)
            }
        }
    }
}
