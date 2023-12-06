import { Borsh, AnyPublicKey, ERROR_INVALID_OWNER, Account } from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { CashProgram } from '../cash_program';

export const MAX_DEPOSIT_DATA_LEN = 1;

export type RedemptionDataArgs = {
  isInitialized: boolean;
};

export class RedemptionData extends Borsh.Data<RedemptionDataArgs> {
  static readonly SCHEMA = RedemptionData.struct([['isInitialized', 'u8']]);
  isInitialized: boolean;

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
