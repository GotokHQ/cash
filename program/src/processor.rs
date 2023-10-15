use borsh::BorshDeserialize;
use crate::instruction::CashInstruction;

use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg, pubkey::Pubkey};

pub mod deposit;
pub mod withdraw;
pub mod escrow;


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
            CashInstruction::InitDeposit(args) => {
                msg!("Instruction: Init deposit");
                deposit::init(program_id, accounts, args)
            }
            CashInstruction::InitWithdrawal(args) => {
                msg!("Instruction: Init withdraw");
                withdraw::init(program_id, accounts, args)
            }
            CashInstruction::InitEscrow(args) => {
                msg!("Instruction: InitEscrow");
                escrow::process_init_escrow(accounts, args, program_id)
            }
            CashInstruction::Settle => {
                msg!("Instruction: Settle Escrow");
                escrow::process_settlement(accounts, program_id)
            }
            CashInstruction::Cancel => {
                msg!("Instruction: Cancel Escrow");
                escrow::process_cancel(accounts, program_id)
            }
            CashInstruction::Close => {
                msg!("Instruction: Close");
                escrow::process_close(accounts, program_id)
            }
        }
    }
}
