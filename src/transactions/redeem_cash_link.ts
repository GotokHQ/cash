import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type RedeemArgs = {
  redemptionBump: number;
  cashLinkBump: number;
  fingerprint?: string;
  fingerprintBump?: number;
};

export class RedeemCashLinkArgs extends Borsh.Data<RedeemArgs> {
  static readonly SCHEMA = RedeemCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['redemptionBump', 'u8'],
    ['cashLinkBump', 'u8'],
    ['fingerprint', { kind: 'option', type: 'string' }],
    ['fingerprint_bump', { kind: 'option', type: 'u8' }],
  ]);

  instruction = 1;
}

export type RedeemCashLinkParams = {
  wallet: PublicKey;
  authority: PublicKey;
  cashLink: PublicKey;
  vaultToken?: PublicKey;
  walletToken: PublicKey;
  senderToken: PublicKey;
  feeToken: PublicKey;
  feePayer: PublicKey;
  redemptionBump: number;
  redemption: PublicKey;
  cashLinkBump: number;
  cashLinkReference: PublicKey;
  fingerprintPda?: PublicKey;
  fingerprint?: string;
  fingerprintBump?: number;
};
