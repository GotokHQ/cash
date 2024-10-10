import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type RedeemArgs = {
  cashBump: number;
  cashReference: string;
  referrerFeeBps?: number;
  refereeFeeBps?: number;
  weightPpm?: number;
  rateUsd?: string;
  redemptionBump: number;
};

export class RedeemCashLinkArgs extends Borsh.Data<RedeemArgs> {
  static readonly SCHEMA = RedeemCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['cashBump', 'u8'],
    ['cashReference', 'string'],
    ['referrerFeeBps', { kind: 'option', type: 'u16' }],
    ['refereeFeeBps', { kind: 'option', type: 'u16' }],
    ['weightPpm', { kind: 'option', type: 'u32' }],
    ['rateUsd', { kind: 'option', type: 'string' }],
    ['redemptionBump', 'u8'],
  ]);

  instruction = 1;
}

export type RedeemCashLinkParams = {
  wallet: PublicKey;
  authority: PublicKey;
  cash: PublicKey;
  cashReference: string;
  vaultToken?: PublicKey;
  walletToken: PublicKey;
  ownerToken: PublicKey;
  platformFeeToken: PublicKey;
  feePayer?: PublicKey | null;
  feePayerToken: PublicKey;
  cashBump: number;
  passKey: PublicKey;
  referrerFeeBps?: number;
  refereeFeeBps?: number;
  referrer?: PublicKey;
  referrerToken?: PublicKey;
  mint: PublicKey;
  tokenProgramId: PublicKey;
  weightPpm?: number;
  rateUsd?: string;
  redemptionBump: number;
  redemptionAddress: PublicKey;
};
