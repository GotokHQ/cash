import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type InitCancelArgs = {
  bump: number;
  reference: string;
};

export class CancelCashLinkArgs extends Borsh.Data<InitCancelArgs> {
  static readonly SCHEMA = CancelCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['bump', 'u8'],
    ['reference', 'string'],
  ]);
  instruction = 2;
  bump: number;
  reference: string;
}

export type CancelCashLinkParams = {
  authority: PublicKey;
  cashLink: PublicKey;
  senderToken: PublicKey;
  vaultToken?: PublicKey | null;
  feePayer: PublicKey;
  cashLinkReference: string;
  bump: number;
};
