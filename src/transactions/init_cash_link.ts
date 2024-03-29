import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CashLinkDistributionType } from 'src/accounts';

export type InitArgs = {
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  feeToRedeem: BN;
  cashLinkBump: number;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
  minAmount?: BN;
  fingerprintEnabled?: boolean;
  numDaysToExpire: number;
};

export class InitCashLinkArgs extends Borsh.Data<InitArgs> {
  static readonly SCHEMA = InitCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['fixedFee', 'u64'],
    ['feeToRedeem', 'u64'],
    ['cashLinkBump', 'u8'],
    ['distributionType', 'u8'],
    ['maxNumRedemptions', 'u16'],
    ['minAmount', { kind: 'option', type: 'u64' }],
    ['fingerprint_enabled', { kind: 'option', type: 'u8' }],
    ['num_days_to_expire', 'u8'],
  ]);

  instruction = 0;
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  feeToRedeem: BN;
  cashLinkBump: number;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
  minAmount?: BN;
  fingerprintEnabled?: boolean;
  numDaysToExpire: number;
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
  cashLinkReference: PublicKey;
  mint?: PublicKey | null;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
  minAmount?: BN;
  fingerprintEnabled?: boolean;
  numDaysToExpire: number;
};
