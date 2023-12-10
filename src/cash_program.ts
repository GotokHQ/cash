import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { CashLink } from './accounts';
import { Redemption } from './accounts/redemption';

export class CashProgram extends Program {
  static readonly PREFIX = 'cash';
  static readonly PUBKEY = new PublicKey('cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q');

  static async findCashLinkAccount(reference: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CashLink.PREFIX), Buffer.from(reference)],
      CashProgram.PUBKEY,
    );
  }

  static async findRedemptionAccount(
    cashLink: PublicKey,
    reference: string,
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Redemption.PREFIX), cashLink.toBuffer(), Buffer.from(reference)],
      CashProgram.PUBKEY,
    );
  }
}
