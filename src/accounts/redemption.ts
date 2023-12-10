import {
  Borsh,
  AnyPublicKey,
  ERROR_INVALID_OWNER,
  Account,
  StringPublicKey,
} from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { CashProgram } from '../cash_program';
import BN from 'bn.js';

export const MAX_DEPOSIT_DATA_LEN = 48;

export type RedemptionDataArgs = {
  redeemedAt: BN;
  wallet: StringPublicKey;
  amount: BN;
};

export class RedemptionData extends Borsh.Data<RedemptionDataArgs> {
  static readonly SCHEMA = RedemptionData.struct([
    ['redeemedAt', 'u64'],
    ['wallet', 'pubkeyAsString'],
    ['amount', 'u64'],
  ]);
  redeemedAt: BN;
  wallet: StringPublicKey;
  amount: BN;

  constructor(args: RedemptionDataArgs) {
    super(args);
  }
}

export class Redemption extends Account<RedemptionData> {
  static readonly PREFIX = 'redeem';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = RedemptionData.deserialize(this.info.data);
    if (!this.assertOwner(CashProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(cashLink: PublicKey, reference: string) {
    const [pubKey] = await CashProgram.findRedemptionAccount(cashLink, reference);
    return pubKey;
  }
}
