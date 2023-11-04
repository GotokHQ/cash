import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export type InitArgs = {
  amount: BN;
  fee: BN;
  cashLinkBump: number;
  pay: boolean;
};

export class InitCashLinkArgs extends Borsh.Data<InitArgs> {
  static readonly SCHEMA = InitCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['cashLinkBump', 'u8'],
    ['pay', 'bool'],
  ]);

  instruction = 0;
  amount: BN;
  fee: BN;
  cashLinkBump: number;
  pay: boolean;
}

export type InitCashLinkParams = {
  amount: BN;
  fee: BN;
  cashLinkBump: number;
  authority: PublicKey;
  feePayer: PublicKey;
  sender: PublicKey;
  cashLink: PublicKey;
  reference: PublicKey;
  mint?: PublicKey | null;
  pay: boolean;
};
