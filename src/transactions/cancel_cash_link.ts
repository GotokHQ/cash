import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type InitCancelArgs = {
  cashLinkBump: number;
};

export class CancelCashLinkArgs extends Borsh.Data<InitCancelArgs> {
  static readonly SCHEMA = CancelCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['cashLinkReference', 'string'],
    ['cashLinkBump', 'u8'],
  ]);
  instruction = 2;
  cashLinkReference: string;
  cashLinkBump: number;
}

export type CancelCashLinkParams = {
  authority: PublicKey;
  cashLink: PublicKey;
  senderToken: PublicKey;
  vaultToken?: PublicKey | null;
  feePayer: PublicKey;
  cashLinkReference: string;
  cashLinkBump: number;
};
