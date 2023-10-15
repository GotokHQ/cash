import { Commitment } from '@solana/web3.js';
export interface InitializePaymentInput {
  wallet: string;
  mint: string;
  reference: string;
  amount: string;
  fee?: string;
  memo?: string;
  commitment?: Commitment;
}
export interface EscrowInput {
  walletAddress: string;
  escrowAddress: string;
  memo?: string;
  commitment?: Commitment;
}

export interface SettleAndTransferInput {
  walletAddress: string;
  transferTokenMintAddress: string;
  amountToSettle: string;
  amountToTransfer: string;
  escrowAddress: string;
  memo?: string;
  fee?: string;
}

export interface CancelPaymentOutput {
  signature: string;
}
