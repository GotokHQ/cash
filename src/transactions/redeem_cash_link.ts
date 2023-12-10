import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type RedeemArgs = {
  redemptionBump: number;
  redemptionReference: string;
  cashLinkBump: number;
  cashLinkReference: string;
};

export class RedeemCashLinkArgs extends Borsh.Data<RedeemArgs> {
  static readonly SCHEMA = RedeemCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['redemptionBump', 'u8'],
    ['redemptionReference', 'string'],
    ['cashLinkBump', 'u8'],
    ['cashLinkReference', 'string'],
  ]);

  instruction = 1;
}

export type RedeemCashLinkParams = {
  recipient: PublicKey;
  authority: PublicKey;
  cashLink: PublicKey;
  vaultToken?: PublicKey;
  recipientToken: PublicKey;
  senderToken: PublicKey;
  feeToken: PublicKey;
  feePayer: PublicKey;
  redemptionBump: number;
  redemptionReference: string;
  redemption: PublicKey;
  cashLinkBump: number;
  cashLinkReference: string;
};
