import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CashDistributionType } from 'src/accounts';

export type InitArgs = {
  amount: BN;
  feeBps: number;
  networkFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
  cashBump: number;
  distributionType: CashDistributionType;
  maxNumRedemptions: number;
  minAmount?: BN;
  fingerprintEnabled?: boolean;
  cashReference: string;
  isLocked: boolean;
};

export class InitCashArgs extends Borsh.Data<InitArgs> {
  static readonly SCHEMA = InitCashArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['networkFee', 'u64'],
    ['baseFeeToRedeem', 'u64'],
    ['rentFeeToRedeem', 'u64'],
    ['cashBump', 'u8'],
    ['distributionType', 'u8'],
    ['maxNumRedemptions', 'u16'],
    ['minAmount', { kind: 'option', type: 'u64' }],
    ['fingerprintEnabled', { kind: 'option', type: 'u8' }],
    ['cashReference', 'string'],
    ['isLocked', 'u8'],
  ]);

  instruction = 0;
  amount: BN;
  feeBps: number;
  networkFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
  cashBump: number;
  distributionType: CashDistributionType;
  maxNumRedemptions: number;
  minAmount?: BN;
  fingerprintEnabled?: boolean;
  cashReference: string;
  isLocked: boolean;
}

export type InitCashParams = {
  amount: BN;
  feeBps: number;
  networkFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
  cashBump: number;
  authority: PublicKey;
  feePayer: PublicKey;
  ownerTokenAccount: PublicKey;
  owner: PublicKey;
  cash: PublicKey;
  passKey?: PublicKey;
  mint: PublicKey;
  distributionType: CashDistributionType;
  maxNumRedemptions: number;
  minAmount?: BN;
  fingerprintEnabled?: boolean;
  tokenProgramId: PublicKey;
  cashReference: string;
};
