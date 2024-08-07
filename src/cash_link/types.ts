import { Commitment } from '@solana/web3.js';
import { CashLinkDistributionType } from 'src/accounts';
export interface InitializeCashLinkInput {
  wallet: string;
  mint?: string;
  passKey: string;
  amount: string;
  minAmount?: string;
  feeBps?: number;
  networkFee?: string;
  totalAmount: string;
  baseFeeToRedeem?: string;
  rentFeeToRedeem?: string;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
  commitment?: Commitment;
  computeUnitPrice?: number;
  computeBudget?: number;
  fingerprintEnabled?: boolean;
  numDaysToExpire?: number;
  addressLookupTable?: string;
  asLegacyTransaction: boolean;
}

export interface ResultContext {
  transaction: string;
  slot: number;
  asLegacyTransaction: boolean;
}

export interface CashLinkInput {
  walletAddress: string;
  passKey: string;
  commitment?: Commitment;
  computeUnitPrice?: number;
  computeBudget?: number;
  addressLookupTable?: string;
  asLegacyTransaction: boolean;
}

export interface RedeemCashLinkInput extends CashLinkInput {
  fingerprint?: string;
  addressLookupTable?: string;
  asLegacyTransaction: boolean;
  referrerFeeBps?: number;
  refereeFeeBps?: number;
  referrer?: string;
}

export interface SettleAndTransferInput {
  walletAddress: string;
  transferTokenMintAddress: string;
  amountToSettle: string;
  amountToTransfer: string;
  cashLinkAddress: string;
  memo?: string;
  fee?: string;
}

export interface CancelPaymentOutput {
  signature: string;
}
