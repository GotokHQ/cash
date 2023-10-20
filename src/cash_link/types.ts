import { Commitment } from '@solana/web3.js';
export interface InitializeCashLinkInput {
  wallet: string;
  mint?: string;
  reference: string;
  amount: string;
  fee?: string;
  memo?: string;
  commitment?: Commitment;
}
export interface CashLinkInput {
  walletAddress: string;
  cashLinkAddress: string;
  memo?: string;
  commitment?: Commitment;
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
