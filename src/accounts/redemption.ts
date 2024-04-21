import { Borsh, AnyPublicKey, ERROR_INVALID_OWNER, Account } from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { CashProgram } from '../cash_program';
import { AccountType } from './account';
import BN from 'bn.js';

export const MAX_REDEMPTION_DATA_LEN = 17;

export type RedemptionDataArgs = {
  accountType: AccountType;
  redeemedAt: BN;
  amount: BN;
};

export class RedemptionData extends Borsh.Data<RedemptionDataArgs> {
  static readonly SCHEMA = RedemptionData.struct([
    ['accountType', 'u8'],
    ['redeemedAt', 'u64'],
    ['amount', 'u64'],
  ]);
  accountType: AccountType;
  redeemedAt: BN;
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

  static async getPDA(cashLink: PublicKey, wallet: PublicKey) {
    const [pubKey] = await CashProgram.findRedemptionAccount(cashLink, wallet);
    return pubKey;
  }
}
