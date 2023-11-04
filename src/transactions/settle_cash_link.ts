import { Borsh, StringPublicKey } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export type SettleArgs = {
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
  bump: number;
};

export class RedeemCashLinkArgs extends Borsh.Data<SettleArgs> {
  static readonly SCHEMA = RedeemCashLinkArgs.struct([['instruction', 'u8']]);

  instruction = 1;
}

export type RedeemCashLinkParams = {
  authority: PublicKey;
  cashLink: PublicKey;
  vaultToken?: PublicKey;
  recipientToken: PublicKey;
  senderToken: PublicKey;
  feeToken: PublicKey;
  feePayer: PublicKey;
};
