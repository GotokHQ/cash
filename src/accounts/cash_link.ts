import {
  Borsh,
  AnyPublicKey,
  ERROR_INVALID_OWNER,
  Account,
  StringPublicKey,
} from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CashProgram } from '../cash_program';

export const MAX_DATA_LEN = 165;

export enum CashLinkState {
  Uninitialized = 0,
  Initialized = 1,
  Redeemed = 2,
  Canceled = 3,
}

export type CashLinkDataArgs = {
  state: CashLinkState;
  amount: BN;
  fee: BN;
  sender: number;
  reference: StringPublicKey;
  redeemedAt?: BN;
  canceledAt?: BN;
  cashLinkBump: number;
  mint?: StringPublicKey;
  authority: StringPublicKey;
};

export class CashLinkData extends Borsh.Data<CashLinkDataArgs> {
  static readonly SCHEMA = CashLinkData.struct([
    ['state', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['sender', 'pubkeyAsString'],
    ['reference', 'pubkeyAsString'],
    ['redeemedAt', { kind: 'option', type: 'u64' }],
    ['canceledAt', { kind: 'option', type: 'u64' }],
    ['cashLinkBump', 'u8'],
    ['mint', { kind: 'option', type: 'pubkeyAsString' }],
    ['authority', 'pubkeyAsString'],
  ]);
  state: CashLinkState;
  amount: BN;
  fee: BN;
  sender: StringPublicKey;
  reference: StringPublicKey;
  redeemedAt: BN | null;
  canceledAt: BN | null;
  cashLinkBump: number;
  mint?: StringPublicKey;
  authority: StringPublicKey;

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

  static async getPDA(reference: PublicKey) {
    const [pubKey] = await CashProgram.findCashLinkAccount(reference);
    return pubKey;
  }
}
