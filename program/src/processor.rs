use borsh::BorshDeserialize;
use crate::instruction::CashInstruction;

use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg, pubkey::Pubkey};

pub mod cash;


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
                cash::process_init_cash_link(accounts, args, program_id)
            }
            CashInstruction::Redeem(args) => {
                msg!("Instruction: Redeem Cash");
                cash::process_redemption(accounts, args, program_id)
            }
            CashInstruction::Cancel(args) => {
                msg!("Instruction: Cancel Cash");
                cash::process_cancel(accounts,  program_id, args,)
            }
            CashInstruction::Close => {
                msg!("Instruction: Close");
                cash::process_close(accounts,  program_id)
            }
        }
    }
}
