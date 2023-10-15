import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  fee: BN;
  escrow_bump: number;
  vault_bump: number;
  reference: string;
};

export class InitEscrowArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitEscrowArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['escrow_bump', 'u8'],
    ['vault_bump', 'u8'],
    ['reference', 'string'],
  ]);

  instruction = 2;
  amount: BN;
  fee: BN;
  escrow_bump: number;
  vault_bump: number;
  reference: string;
}

export type InitEscrowParams = {
  amount: BN;
  fee: BN;
  reference: string;
  escrowBump: number;
  vaultBump: number;
  authority: PublicKey;
  feePayer: PublicKey;
  payer: PublicKey;
  escrow: PublicKey;
  vaultToken: PublicKey;
  mint: PublicKey;
};
