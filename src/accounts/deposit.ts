import { Borsh, AnyPublicKey, ERROR_INVALID_OWNER, Account } from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { CashProgram } from '../cashProgram';

export const MAX_DEPOSIT_DATA_LEN = 1;

export type DepositDataArgs = {
  isInitialized: boolean;
};

export class DepositData extends Borsh.Data<DepositDataArgs> {
  static readonly SCHEMA = DepositData.struct([['isInitialized', 'u8']]);
  isInitialized: boolean;

  constructor(args: DepositDataArgs) {
    super(args);
  }
}

export class Deposit extends Account<DepositData> {
  static readonly PREFIX = 'deposit';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = DepositData.deserialize(this.info.data);
    if (!this.assertOwner(CashProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(key: AnyPublicKey) {
    return CashProgram.findProgramAddress([
      Buffer.from(Deposit.PREFIX),
      new PublicKey(key).toBuffer(),
    ]);
  }
}
