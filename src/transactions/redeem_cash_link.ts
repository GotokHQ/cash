import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type RedeemArgs = {
  cashLinkBump: number;
  fingerprintBump?: number;
  referrerFeeBps?: number;
  refereeFeeBps?: number;
};

export class RedeemCashLinkArgs extends Borsh.Data<RedeemArgs> {
  static readonly SCHEMA = RedeemCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['cashLinkBump', 'u8'],
    ['fingerprintBump', { kind: 'option', type: 'u8' }],
    ['referrerFeeBps', { kind: 'option', type: 'u16' }],
    ['refereeFeeBps', { kind: 'option', type: 'u16' }],
  ]);

  instruction = 1;
}

export type RedeemCashLinkParams = {
  wallet: PublicKey;
  authority: PublicKey;
  cashLink: PublicKey;
  vaultToken?: PublicKey;
  walletToken: PublicKey;
  ownerToken: PublicKey;
  platformFeeToken: PublicKey;
  feePayer?: PublicKey | null;
  feePayerToken: PublicKey;
  cashLinkBump: number;
  passKey: PublicKey;
  fingerprintPda?: PublicKey;
  fingerprint?: PublicKey;
  fingerprintBump?: number;
  referrerFeeBps?: number;
  refereeFeeBps?: number;
  referrer?: PublicKey;
  referrerToken?: PublicKey;
  mint: PublicKey;
  tokenProgramId: PublicKey;
};
