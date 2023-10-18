import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { CashLink } from './accounts';

export class CashProgram extends Program {
  static readonly PREFIX = 'cash';
  static readonly PUBKEY = new PublicKey('cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q');

  static async findCashLinkAccount(reference: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CashLink.PREFIX), reference.toBuffer()],
      CashProgram.PUBKEY,
    );
  }
}
