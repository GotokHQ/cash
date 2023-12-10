import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CashLinkDistributionType } from 'src/accounts';

export type InitArgs = {
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  feeToRedeem: BN;
  bump: number;
  reference: string;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
};

export class InitCashLinkArgs extends Borsh.Data<InitArgs> {
  static readonly SCHEMA = InitCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['fixedFee', 'u64'],
    ['feeToRedeem', 'u64'],
    ['bump', 'u8'],
    ['reference', 'string'],
    ['distributionType', 'u8'],
    ['maxNumRedemptions', 'u16'],
  ]);

  instruction = 0;
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  feeToRedeem: BN;
  bump: number;
  reference: string;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
}

export type InitCashLinkParams = {
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  feeToRedeem: BN;
  cashLinkBump: number;
  authority: PublicKey;
  feePayer: PublicKey;
  sender: PublicKey;
  cashLink: PublicKey;
  reference: string;
  mint?: PublicKey | null;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
};
