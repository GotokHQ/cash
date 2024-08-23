import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CashLinkDistributionType } from 'src/accounts';

export type InitArgs = {
  amount: BN;
  feeBps: number;
  networkFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
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
    ['networkFee', 'u64'],
    ['baseFeeToRedeem', 'u64'],
    ['rentFeeToRedeem', 'u64'],
    ['cashLinkBump', 'u8'],
    ['distributionType', 'u8'],
    ['maxNumRedemptions', 'u16'],
    ['minAmount', { kind: 'option', type: 'u64' }],
    ['fingerprintEnabled', { kind: 'option', type: 'u8' }],
    ['numDaysToExpire', 'u8'],
  ]);

  instruction = 0;
  amount: BN;
  feeBps: number;
  networkFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
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
  networkFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
  cashLinkBump: number;
  authority: PublicKey;
  feePayer: PublicKey;
  ownerTokenAccount: PublicKey;
  ownerTokenAccountIsSigner: boolean;
  owner: PublicKey;
  cashLink: PublicKey;
  passKey: PublicKey;
  mint: PublicKey;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
  minAmount?: BN;
  fingerprintEnabled?: boolean;
  numDaysToExpire: number;
  tokenProgramId: PublicKey;
};
