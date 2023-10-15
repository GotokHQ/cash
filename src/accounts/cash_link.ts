import {
  Borsh,
  AnyPublicKey,
  ERROR_INVALID_OWNER,
  Account,
  StringPublicKey,
} from '@metaplex-foundation/mpl-core';
import { AccountInfo } from '@solana/web3.js';
import BN from 'bn.js';
import { CashProgram } from '../cashProgram';

export const MAX_ESCROW_DATA_LEN = 164;

export enum CashLinkState {
  Uninitialized = 0,
  Initialized = 1,
  Settled = 2,
  Canceled = 3,
  Closed = 4,
}

export type CashLinkDataArgs = {
  state: CashLinkState;
  amount: BN;
  fee: BN;
  vaultToken: StringPublicKey;
  vaultBump: number;
  mint: StringPublicKey;
  authority: StringPublicKey;
  payer: StringPublicKey;
  settled_at?: BN;
  canceled_at?: BN;
};

export class CashLinkData extends Borsh.Data<CashLinkDataArgs> {
  static readonly SCHEMA = CashLinkData.struct([
    ['state', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['payer', 'pubkeyAsString'],
    ['vaultToken', 'pubkeyAsString'],
    ['vaultBump', 'u8'],
    ['mint', 'pubkeyAsString'],
    ['authority', 'pubkeyAsString'],
    ['settled_at', { kind: 'option', type: 'u64' }],
    ['canceled_at', { kind: 'option', type: 'u64' }],
  ]);
  state: CashLinkState;
  amount: BN;
  fee: BN;
  payer: StringPublicKey;
  vaultToken: StringPublicKey;
  vaultBump: number;
  mint: StringPublicKey;
  authority: StringPublicKey;
  settled_at: BN | null;
  canceled_at: BN | null;

  constructor(args: CashLinkDataArgs) {
    super(args);
  }
}

export class CashLink extends Account<CashLinkData> {
  static readonly PREFIX = 'cash';
  static readonly VAULT_PREFIX = 'vault';
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
