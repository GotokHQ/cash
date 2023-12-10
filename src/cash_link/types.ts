import { Commitment } from '@solana/web3.js';
import { CashLinkDistributionType } from 'src/accounts';
export interface InitializeCashLinkInput {
  wallet: string;
  mint?: string;
  reference: string;
  amount: string;
  feeBps?: number;
  fixedFee?: string;
  feeToRedeem?: string;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
  commitment?: Commitment;
}

export interface ResultContext {
  transaction: string;
  slot: number;
}

export interface CashLinkInput {
  walletAddress: string;
  cashLinkReference: string;
  commitment?: Commitment;
}

export interface RedeemCashLinkInput extends CashLinkInput {
  redemptionReference: string;
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
