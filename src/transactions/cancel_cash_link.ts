import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export class CancelCashLinkArgs extends Borsh.Data {
  static readonly SCHEMA = CancelCashLinkArgs.struct([['instruction', 'u8']]);

  instruction = 2;
}

export type CancelCashLinkParams = {
  authority: PublicKey;
  cashLink: PublicKey;
  senderToken: PublicKey;
  vaultToken?: PublicKey | null;
  feePayer: PublicKey;
  reference: PublicKey;
};
