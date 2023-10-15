import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  fee: BN;
  bump: number;
  reference: string;
};

export class InitDepositArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitDepositArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['bump', 'u8'],
    ['reference', 'string'],
  ]);

  instruction = 0;
  amount: BN;
  fee: BN;
  bump: number;
  reference: string;
}

export type InitDepositParams = {
  amount: BN;
  fee: BN;
  reference: string;
  bump: number;
  user: PublicKey;
  payer: PublicKey;
  deposit: PublicKey;
  sourceToken: PublicKey;
  collectionToken: PublicKey;
  collectionFeeToken: PublicKey;
  mint: PublicKey;
};
