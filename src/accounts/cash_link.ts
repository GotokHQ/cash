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

export const MAX_CASH_LINK_DATA_LEN = 156;

export enum CashLinkState {
  Uninitialized = 0,
  Initialized = 1,
  Redeemed = 2,
  Redeeming = 3,
  Canceled = 4,
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
  feeToRedeem: BN;
  remainingAmount: BN;
  remainingFee: BN;
  distributionType: CashLinkDistributionType;
  sender: number;
  lastRedeemedAt?: BN;
  canceledAt?: BN;
  mint?: StringPublicKey;
  totalRedemptions: BN;
  maxNumRedemptions: BN;
};

export class CashLinkData extends Borsh.Data<CashLinkDataArgs> {
  static readonly SCHEMA = CashLinkData.struct([
    ['accountType', 'u8'],
    ['authority', 'pubkeyAsString'],
    ['state', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['fixedFee', 'u64'],
    ['feeToRedeem', 'u64'],
    ['remainingAmount', 'u64'],
    ['distributionType', 'u8'],
    ['sender', 'pubkeyAsString'],
    ['lastRedeemedAt', { kind: 'option', type: 'u64' }],
    ['canceledAt', { kind: 'option', type: 'u64' }],
    ['mint', { kind: 'option', type: 'pubkeyAsString' }],
    ['totalRedemptions', 'u16'],
    ['maxNumRedemptions', 'u16'],
  ]);
  accountType: AccountType;
  authority: StringPublicKey;
  state: CashLinkState;
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  feeToRedeem: BN;
  remainingAmount: BN;
  remainingFee: BN;
  distributionType: CashLinkDistributionType;
  sender: StringPublicKey;
  lastRedeemedAt: BN | null;
  canceledAt: BN | null;
  mint?: StringPublicKey;
  totalRedemptions: BN;
  maxNumRedemptions: BN;

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

  static async getPDA(cashLinkReference: PublicKey) {
    const [pubKey] = await CashProgram.findCashLinkAccount(cashLinkReference);
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
