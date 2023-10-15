import { Borsh, StringPublicKey } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
  bump: number;
};

export class SettleCashLinkArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = SettleCashLinkArgs.struct([['instruction', 'u8']]);

  instruction = 1;
}

export type SettleCashLinkParams = {
  authority: PublicKey;
  cashLink: PublicKey;
  vaultToken: PublicKey;
  destinationToken: PublicKey;
  payerToken: PublicKey;
  feeToken: PublicKey;
  mint: PublicKey;
  feePayer: PublicKey;
};
