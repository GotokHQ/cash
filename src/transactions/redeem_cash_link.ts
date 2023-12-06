import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type RedeemArgs = {
  bump: number;
  reference: string;
};

export class RedeemCashLinkArgs extends Borsh.Data<RedeemArgs> {
  static readonly SCHEMA = RedeemCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['bump', 'u8'],
    ['reference', 'string'],
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
  reference: string;
  redemption: PublicKey;
  bump: number;
};
