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

export enum CashLinkState {
  Initialized = 0,
  Redeemed = 1,
  Redeeming = 2,
  Expired = 3,
}

export enum CashLinkDistributionType {
  Fixed = 0,
  Random = 1,
}

export type CashLinkDataArgs = {
  accountType: AccountType;
  authority: StringPublicKey;
  state: CashLinkState;
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
  remainingAmount: BN;
  distributionType: CashLinkDistributionType;
  owner: number;
  expiresAt: BN;
  mint: StringPublicKey;
  totalRedemptions: BN;
  maxNumRedemptions: BN;
  minAmount: BN;
  fingerprintEnabled: boolean;
  passKey: StringPublicKey;
};

export class CashLinkData extends Borsh.Data<CashLinkDataArgs> {
  static readonly SCHEMA = CashLinkData.struct([
    ['accountType', 'u8'],
    ['authority', 'pubkeyAsString'],
    ['state', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['fixedFee', 'u64'],
    ['baseFeeToRedeem', 'u64'],
    ['rentFeeToRedeem', 'u64'],
    ['remainingAmount', 'u64'],
    ['distributionType', 'u8'],
    ['owner', 'pubkeyAsString'],
    ['expiresAt', 'u64'],
    ['mint', 'pubkeyAsString'],
    ['totalRedemptions', 'u16'],
    ['maxNumRedemptions', 'u16'],
    ['minAmount', 'u64'],
    ['fingerprintEnabled', 'u8'],
    ['passKey', 'pubkeyAsString'],
  ]);
  accountType: AccountType;
  authority: StringPublicKey;
  state: CashLinkState;
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  baseFeeToRedeem: BN;
  rentFeeToRedeem: BN;
  remainingAmount: BN;
  distributionType: CashLinkDistributionType;
  owner: StringPublicKey;
  expiresAt: BN;
  mint: StringPublicKey;
  totalRedemptions: number;
  maxNumRedemptions: number;
  minAmount: BN;
  fingerprintEnabled: boolean;
  passKey: StringPublicKey;

  constructor(args: CashLinkDataArgs) {
    super(args);
  }
}

export class CashLink extends Account<CashLinkData> {
  static readonly PREFIX = 'cash';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = CashLinkData.deserialize(this.info.data);
    if (!this.assertOwner(CashProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(passKey: PublicKey) {
    const [pubKey] = await CashProgram.findCashLinkAccount(passKey);
    return pubKey;
  }

  static async findMany(
    connection: Connection,
    filters: {
      authority?: AnyPublicKey;
      state?: CashLinkState;
    } = {},
    commitment?: Commitment,
  ) {
    const baseFilters = [
      // Filter for CashLink by account type
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from([AccountType.CashLink])),
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
    ).map((account) => CashLink.from(account));
  }
}
