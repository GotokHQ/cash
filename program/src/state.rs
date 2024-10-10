use borsh::{BorshDeserialize, BorshSerialize, BorshSchema};

pub mod cash;

pub const FLAG_ACCOUNT_SIZE: usize = 1;
pub const REDEMPTION_PREFIX: &'static str = "redemption";

#[derive(Clone, Debug, PartialEq, Eq, BorshDeserialize, BorshSerialize, BorshSchema)]
pub enum AccountType {
    /// If the account has not been initialized, the enum will be 0
    Uninitialized,
    /// A cashlink account type
    Cash,
}

impl Default for AccountType {
    fn default() -> Self {
        AccountType::Uninitialized
    }
}