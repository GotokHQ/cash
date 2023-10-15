import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  fee: BN;
  reference: string;
  bump: number;
};

export class InitWithdrawArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitWithdrawArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['reference', 'string'],
    ['bump', 'u8'],
  ]);

  instruction = 1;
  amount: BN;
  fee: BN;
  reference: string;
  bump: number;
}

export type InitWithdrawParams = {
  amount: BN;
  fee: BN;
  reference: string;
  bump: number;
  wallet: PublicKey;
  payer: PublicKey;
  withdraw: PublicKey;
  sourceToken: PublicKey;
  destinationToken: PublicKey;
  collectionFeeToken: PublicKey;
  mint: PublicKey;
};
