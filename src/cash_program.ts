import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { CashLink } from './accounts';
import { Redemption } from './accounts/redemption';
import bs58 from 'bs58';

export class CashProgram extends Program {
  static readonly PREFIX = 'cash';
  static readonly PUBKEY = new PublicKey('cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q');

  static async findCashLinkAccount(reference: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CashLink.PREFIX), reference.toBuffer()],
      CashProgram.PUBKEY,
    );
  }

  static async findRedemptionAccount(
    cashLink: PublicKey,
    reference: string,
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Redemption.PREFIX), cashLink.toBuffer(), bs58.decode(reference)],
      CashProgram.PUBKEY,
    );
  }
}
