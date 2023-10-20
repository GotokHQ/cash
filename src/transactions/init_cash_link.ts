import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  fee: BN;
  cashLinkBump: number;
};

export class InitCashLinkArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['cashLinkBump', 'u8'],
  ]);

  instruction = 0;
  amount: BN;
  fee: BN;
  cashLinkBump: number;
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
};
