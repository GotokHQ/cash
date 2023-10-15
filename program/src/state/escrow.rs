use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    borsh0_10::try_from_slice_unchecked,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed}, pubkey::Pubkey,
};

pub const ESCROW_DATA_SIZE: usize = 164;

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone, Default)]
pub enum EscrowState {
    #[default]
    Uninitialized = 0,
    Initialized,
    Settled,
    Canceled,
    Closed,
}
#[repr(C)]
#[derive(Debug, Clone, PartialEq, BorshSerialize, BorshDeserialize, Default)]
pub struct Escrow {
    pub state: EscrowState,
    pub amount: u64,
    pub fee: u64,
    pub payer: Pubkey,
    pub vault_token: Pubkey,
    pub settled_at: Option<u64>,
    pub canceled_at: Option<u64>,
    pub vault_bump: u8,
    pub mint: Pubkey,
    pub authority: Pubkey,
}

impl Escrow {
    pub const PREFIX: &'static str = "escrow";
    pub const VAULT_PREFIX: &'static str = "vault";
    pub fn is_closed(&self) -> bool {
        self.state == EscrowState::Closed
    }
    pub fn is_settled(&self) -> bool {
        self.state == EscrowState::Settled
    }
    pub fn is_canceled(&self) -> bool {
        self.state == EscrowState::Canceled
    }
}

impl IsInitialized for Escrow {
    fn is_initialized(&self) -> bool {
        self.state == EscrowState::Initialized
    }
}

impl Sealed for Escrow {}

impl Pack for Escrow {
    const LEN: usize = ESCROW_DATA_SIZE;

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

