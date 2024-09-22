import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
export class CloseCashArgs extends Borsh.Data {
  static readonly SCHEMA = CloseCashArgs.struct([['instruction', 'u8']]);

  instruction = 3;
}

export type CloseCashParams = {
  authority: PublicKey;
  cash: PublicKey;
  destinationWallet: PublicKey;
};
