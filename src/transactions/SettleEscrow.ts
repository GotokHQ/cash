import { Borsh, StringPublicKey } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
  bump: number;
};

export class SettleEscrowArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = SettleEscrowArgs.struct([['instruction', 'u8']]);

  instruction = 3;
}

export type SettleEscrowParams = {
  authority: PublicKey;
  escrow: PublicKey;
  vaultToken: PublicKey;
  destinationToken: PublicKey;
  payerToken: PublicKey;
  feeToken: PublicKey;
  mint: PublicKey;
  feePayer: PublicKey;
};
