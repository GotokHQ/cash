use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    borsh0_10::try_from_slice_unchecked,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
};

use super::FLAG_ACCOUNT_SIZE;

#[repr(C)]
#[derive(Debug, Clone, PartialEq, BorshSerialize, BorshDeserialize, Default)]
pub struct Withdraw {
    pub is_initialized: bool,
}

impl Withdraw {
    pub const PREFIX: &'static str = "withdraw";
}

impl IsInitialized for Withdraw {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Sealed for Withdraw {}

impl Pack for Withdraw {
    const LEN: usize = FLAG_ACCOUNT_SIZE;

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let mut slice = dst;
        self.serialize(&mut slice).unwrap()
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() != Self::LEN
        {
            msg!("Failed to deserialize");
            return Err(ProgramError::InvalidAccountData);
        }

        let result: Self = try_from_slice_unchecked(src)?;

        Ok(result)
    }
}

