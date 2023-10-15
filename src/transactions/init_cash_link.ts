import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  fee: BN;
  cashLinkBump: number;
  vaultBump: number;
  reference: string;
};

export class InitCashLinkArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['cashLinkBump', 'u8'],
    ['vaultBump', 'u8'],
    ['reference', 'string'],
  ]);

  instruction = 0;
  amount: BN;
  fee: BN;
  cashLinkBump: number;
  vaultBump: number;
  reference: string;
}

export type InitCashLinkParams = {
  amount: BN;
  fee: BN;
  reference: string;
  cashLinkBump: number;
  vaultBump: number;
  authority: PublicKey;
  feePayer: PublicKey;
  payer: PublicKey;
  cashLink: PublicKey;
  vaultToken: PublicKey;
  mint: PublicKey;
};
