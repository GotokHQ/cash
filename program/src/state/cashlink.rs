use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    borsh0_10::try_from_slice_unchecked,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed}, pubkey::Pubkey,
};

pub const CASH_LINK_DATA_SIZE: usize = 165;

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone, Default)]
pub enum CashLinkState {
    #[default]
    Uninitialized = 0,
    Initialized,
    Redeemed,
    Canceled,
}
#[repr(C)]
#[derive(Debug, Clone, PartialEq, BorshSerialize, BorshDeserialize, Default)]
pub struct CashLink {
    pub state: CashLinkState,
    pub amount: u64,
    pub fee: u64,
    pub sender: Pubkey,
    pub reference: Pubkey,
    pub redeemed_at: Option<u64>,
    pub canceled_at: Option<u64>,
    pub cash_link_bump: u8,
    pub mint: Option<Pubkey>,
    pub authority: Pubkey,
}

impl CashLink {
    pub const PREFIX: &'static str = "cash";
    pub fn redeemed(&self) -> bool {
        self.state == CashLinkState::Redeemed
    }
    pub fn canceled(&self) -> bool {
        self.state == CashLinkState::Canceled
    }
    pub fn initialized(&self) -> bool {
        self.state == CashLinkState::Initialized
    }
}

impl IsInitialized for CashLink {
    fn is_initialized(&self) -> bool {
        self.state != CashLinkState::Uninitialized
    }
}

impl Sealed for CashLink {}

impl Pack for CashLink {
    const LEN: usize = CASH_LINK_DATA_SIZE;

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

