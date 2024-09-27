use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    borsh1::try_from_slice_unchecked,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

use crate::error::CashError;

use super::AccountType;

pub const CASH_DATA_SIZE: usize = 195;

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone, Default)]
#[borsh(use_discriminant=true)]
pub enum CashState {
    #[default]
    Initialized = 0,
    Redeemed,
    Redeeming,
    Canceled,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone, Default)]
#[borsh(use_discriminant=true)]
pub enum DistributionType {
    #[default]
    Fixed = 0,
    Random,
    Weighted,
    Equal,
}

#[repr(C)]
#[derive(Debug, Clone, PartialEq, BorshSerialize, BorshDeserialize, Default)]
pub struct Cash {
    pub account_type: AccountType,
    pub authority: Pubkey,
    pub state: CashState,
    pub amount: u64,
    pub fee_bps: u16,
    pub network_fee: u64,
    pub base_fee_to_redeem: u64,
    pub rent_fee_to_redeem: u64,
    pub remaining_amount: u64,
    pub distribution_type: DistributionType,//77
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub total_redemptions: u16,
    pub max_num_redemptions: u16,
    pub min_amount: u64,
    pub fingerprint_enabled: bool,
    pub pass_key: Option<Pubkey>,//187
    pub total_weight_ppm: u32,
}

impl Cash {
    pub const PREFIX: &'static str = "cash";
    pub fn redeemed(&self) -> bool {
        self.state == CashState::Redeemed
    }
    pub fn redeeming(&self) -> bool {
        self.state == CashState::Redeeming
    }
    pub fn canceled(&self) -> bool {
        self.state == CashState::Canceled
    }
    pub fn initialized(&self) -> bool {
        self.state == CashState::Initialized
    }
    pub fn is_fully_redeemed(&self) -> Result<bool, CashError> {
        Ok(self.total_redemptions == self.max_num_redemptions
            || self.remaining_amount == 0
            || self.remaining_amount < self.min_total_required()?)
    }
    pub fn max_fee_to_redeem(&self) -> Result<u64, CashError> {
        self.base_fee_to_redeem.checked_add(self.rent_fee_to_redeem).ok_or(CashError::Overflow)
    }
    pub fn max_num_redemptions_remaining(&self) -> Result<u16, CashError> {
        self.max_num_redemptions
            .checked_sub(self.total_redemptions)
            .ok_or(CashError::Overflow)
    }

    pub fn min_total_required(&self) -> Result<u64, CashError> {
        Ok(self.min_amount * self.max_num_redemptions_remaining()? as u64)
    }
}

impl IsInitialized for Cash {
    fn is_initialized(&self) -> bool {
        self.initialized() || self.redeeming() || self.redeemed() || self.canceled()
    }
}

impl Sealed for Cash {}

impl Pack for Cash {
    const LEN: usize = CASH_DATA_SIZE;

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
