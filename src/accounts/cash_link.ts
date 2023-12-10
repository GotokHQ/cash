import {
  Borsh,
  AnyPublicKey,
  ERROR_INVALID_OWNER,
  Account,
  StringPublicKey,
} from '@metaplex-foundation/mpl-core';
import { AccountInfo } from '@solana/web3.js';
import BN from 'bn.js';
import { CashProgram } from '../cash_program';

export const MAX_DATA_LEN = 153;

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
  state: CashLinkState;
  amount: BN;
  fee: BN;
  remainingAmount: BN;
  remainingFee: BN;
  distributionType: CashLinkDistributionType;
  sender: number;
  lastRedeemedAt?: BN;
  canceledAt?: BN;
  mint?: StringPublicKey;
  authority: StringPublicKey;
  totalRedemptions: BN;
  maxNumRedemptions: BN;
};

export class CashLinkData extends Borsh.Data<CashLinkDataArgs> {
  static readonly SCHEMA = CashLinkData.struct([
    ['state', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['remainingAmount', 'u64'],
    ['remainingFee', 'u64'],
    ['distributionType', 'u8'],
    ['sender', 'pubkeyAsString'],
    ['lastRedeemedAt', { kind: 'option', type: 'u64' }],
    ['canceledAt', { kind: 'option', type: 'u64' }],
    ['mint', { kind: 'option', type: 'pubkeyAsString' }],
    ['authority', 'pubkeyAsString'],
    ['totalRedemptions', 'u16'],
    ['maxNumRedemptions', 'u16'],
  ]);
  state: CashLinkState;
  amount: BN;
  fee: BN;
  remainingAmount: BN;
  remainingFee: BN;
  distributionType: CashLinkDistributionType;
  sender: StringPublicKey;
  lastRedeemedAt: BN | null;
  canceledAt: BN | null;
  mint?: StringPublicKey;
  authority: StringPublicKey;
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

  static async getPDA(reference: string) {
    const [pubKey] = await CashProgram.findCashLinkAccount(reference);
    return pubKey;
  }
}
