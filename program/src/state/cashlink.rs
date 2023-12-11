use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    borsh0_10::try_from_slice_unchecked,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

use super::AccountType;



pub const CASH_LINK_DATA_SIZE: usize = 156;

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone, Default)]
pub enum CashLinkState {
    #[default]
    Uninitialized = 0,
    Initialized,
    Redeemed,
    Redeeming,
    Canceled,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone, Default)]
pub enum DistributionType {
    #[default]
    Fixed = 0,
    Random,
}

#[repr(C)]
#[derive(Debug, Clone, PartialEq, BorshSerialize, BorshDeserialize, Default)]
pub struct CashLink {
    pub account_type: AccountType,
    pub state: CashLinkState,
    pub amount: u64,
    pub fee_bps: u16,
    pub fixed_fee: u64,
    pub fee_to_redeem: u64,
    pub remaining_amount: u64,
    pub distribution_type: DistributionType,
    pub sender: Pubkey,
    pub last_redeemed_at: Option<u64>,
    pub canceled_at: Option<u64>,
    pub mint: Option<Pubkey>,
    pub authority: Pubkey,
    pub total_redemptions: u16,
    pub max_num_redemptions: u16,
}

impl CashLink {
    pub const PREFIX: &'static str = "cash";
    pub fn redeemed(&self) -> bool {
        self.state == CashLinkState::Redeemed
    }
    pub fn redeeming(&self) -> bool {
        self.state == CashLinkState::Redeeming
    }
    pub fn canceled(&self) -> bool {
        self.state == CashLinkState::Canceled
    }
    pub fn initialized(&self) -> bool {
        self.state == CashLinkState::Initialized
    }
    pub fn is_fully_redeemed(&self) -> bool {
        self.total_redemptions == self.max_num_redemptions || self.remaining_amount == 0
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
        if src.len() != Self::LEN {
            msg!("Failed to deserialize");
            return Err(ProgramError::InvalidAccountData);
        }

        let result: Self = try_from_slice_unchecked(src)?;

        Ok(result)
    }
}
