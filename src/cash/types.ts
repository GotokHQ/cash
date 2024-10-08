import { Commitment } from '@solana/web3.js';
import { CashDistributionType } from 'src/accounts';
export interface InitializeCashInput {
  wallet: string;
  mint?: string;
  passKey?: string;
  amount: string;
  minAmount?: string;
  feeBps?: number;
  networkFee?: string;
  totalAmount: string;
  baseFeeToRedeem?: string;
  rentFeeToRedeem?: string;
  distributionType: CashDistributionType;
  maxNumRedemptions: number;
  commitment?: Commitment;
  computeUnitPrice?: number;
  computeBudget?: number;
  fingerprintEnabled?: boolean;
  cashReference: string;
  addressLookupTable?: string;
  asLegacyTransaction: boolean;
  tokenProgramId: string;
}

export interface ResultContext {
  transaction: string;
  slot: number;
  asLegacyTransaction: boolean;
}

export interface CashInput {
  walletAddress: string;
  cashReference: string;
  commitment?: Commitment;
  computeUnitPrice?: number;
  computeBudget?: number;
  addressLookupTable?: string;
  asLegacyTransaction: boolean;
  tokenProgramId: string;
}

export interface RedeemCashInput extends CashInput {
  fingerprint?: string;
  passKey?: string;
  addressLookupTable?: string;
  asLegacyTransaction: boolean;
  referrerFeeBps?: number;
  refereeFeeBps?: number;
  referrer?: string;
  tokenProgramId: string;
  cashReference: string;
  rateUsd: string;
  weightPpm?: number;
}
