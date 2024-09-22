import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type InitCancelArgs = {
  cashBump: number;
  cashReference: string;
};

export class CancelCashArgs extends Borsh.Data<InitCancelArgs> {
  static readonly SCHEMA = CancelCashArgs.struct([
    ['instruction', 'u8'],
    ['cashBump', 'u8'],
    ['cashReference', 'string'],
  ]);
  instruction = 2;
  cashBump: number;
  cashReference: string;
}

export type CancelCashParams = {
  authority: PublicKey;
  cash: PublicKey;
  ownerToken: PublicKey;
  cashReference: string;
  vaultToken?: PublicKey | null;
  feePayer: PublicKey;
  cashBump: number;
  tokenProgramId: PublicKey;
  mint: PublicKey;
};
