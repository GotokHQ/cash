import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type RedeemArgs = {
  redemptionBump: number;
  cashLinkBump: number;
  reference: string;
};

export class RedeemCashLinkArgs extends Borsh.Data<RedeemArgs> {
  static readonly SCHEMA = RedeemCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['redemptionBump', 'u8'],
    ['cashLinkBump', 'u8'],
    ['reference', 'string'],
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
  reference: string;
};
