import {
  Borsh,
  AnyPublicKey,
  ERROR_INVALID_OWNER,
  Account,
  StringPublicKey,
} from '@metaplex-foundation/mpl-core';
import { AccountInfo, Commitment, Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { CashProgram } from '../cash_program';
import { AccountType } from './account';

export const MAX_CASH_LINK_DATA_LEN = 194;

export enum CashState {
  Initialized = 0,
  Redeemed = 1,
  Redeeming = 2,
  Canceled = 3,
}

export enum CashDistributionType {
  Fixed = 0,
  Random = 1,
  Weighted = 2,
  Equal = 3,
}

export type CashDataArgs = {
  accountType: AccountType;
  authority: StringPublicKey;
  state: CashState;
  amount: BN;
  feeBps: number;
  networkFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
  remainingAmount: BN;
  distributionType: CashDistributionType;
  owner: number;
  mint: StringPublicKey;
  totalRedemptions: BN;
  maxNumRedemptions: BN;
  minAmount: BN;
  fingerprintEnabled: boolean;
  passKey?: StringPublicKey;
  totalWeightPpm: number;
};

export class CashData extends Borsh.Data<CashDataArgs> {
  static readonly SCHEMA = CashData.struct([
    ['accountType', 'u8'],
    ['authority', 'pubkeyAsString'],
    ['state', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['networkFee', 'u64'],
    ['baseFeeToRedeem', 'u64'],
    ['rentFeeToRedeem', 'u64'],
    ['remainingAmount', 'u64'],
    ['distributionType', 'u8'],
    ['owner', 'pubkeyAsString'],
    ['mint', 'pubkeyAsString'],
    ['totalRedemptions', 'u16'],
    ['maxNumRedemptions', 'u16'],
    ['minAmount', 'u64'],
    ['fingerprintEnabled', 'u8'],
    ['passKey', { kind: 'option', type: 'pubkeyAsString' }],
    ['totalWeightPpm', 'u32'],
  ]);
  accountType: AccountType;
  authority: StringPublicKey;
  state: CashState;
  amount: BN;
  feeBps: number;
  networkFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
  remainingAmount: BN;
  distributionType: CashDistributionType;
  owner: StringPublicKey;
  mint: StringPublicKey;
  totalRedemptions: number;
  maxNumRedemptions: number;
  minAmount: BN;
  fingerprintEnabled: boolean;
  passKey?: StringPublicKey;
  totalWeightPpm: number;

  constructor(args: CashDataArgs) {
    super(args);
  }
}

export class Cash extends Account<CashData> {
  static readonly PREFIX = 'cash';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = CashData.deserialize(this.info.data);
    if (!this.assertOwner(CashProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static getPDA(reference: string) {
    const [pubKey] = CashProgram.cashAccount(reference);
    return pubKey;
  }

  static async findMany(
    connection: Connection,
    filters: {
      authority?: AnyPublicKey;
      state?: CashState;
    } = {},
    commitment?: Commitment,
  ) {
    const baseFilters = [
      // Filter for Cash by account type
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from([AccountType.Cash])),
        },
      },
      // Filter for assigned to authority
      filters.authority && {
        memcmp: {
          offset: 1,
          bytes: new PublicKey(filters.authority).toBase58(),
        },
      },
      // Filter by state
      filters.state && {
        memcmp: {
          offset: 33,
          bytes: bs58.encode(Buffer.from([filters.state])),
        },
      },
    ].filter(Boolean);

    return (
      await CashProgram.getProgramAccounts(connection, { filters: baseFilters, commitment })
    ).map((account) => Cash.from(account));
  }
}
