import { Borsh, AnyPublicKey, ERROR_INVALID_OWNER, Account } from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { CashProgram } from '../cashProgram';

export const MAX_WITHDRAW_DATA_LEN = 1;

export type WithdrawDataArgs = {
  isInitialized: boolean;
};

export class WithdrawData extends Borsh.Data<WithdrawDataArgs> {
  static readonly SCHEMA = WithdrawData.struct([['isInitialized', 'u8']]);
  isInitialized: boolean;

  constructor(args: WithdrawDataArgs) {
    super(args);
  }
}

export class Withdraw extends Account<WithdrawData> {
  static readonly PREFIX = 'withdraw';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = WithdrawData.deserialize(this.info.data);
    if (!this.assertOwner(CashProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(key: AnyPublicKey) {
    return CashProgram.findProgramAddress([
      Buffer.from(Withdraw.PREFIX),
      new PublicKey(key).toBuffer(),
    ]);
  }
}
