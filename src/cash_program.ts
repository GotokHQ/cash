import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { Cash } from './accounts';

export class CashProgram extends Program {
  static readonly PREFIX = 'cash';
  static readonly REDEMPTION_PREFIX = 'redemption';
  static readonly PUBKEY = new PublicKey('cashXAE5UP18RyU7ByFWfxu93kGg69KzoktacNQDukW');

  static cashAccount(reference: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(Cash.PREFIX), Buffer.from(reference)],
      CashProgram.PUBKEY,
    );
  }

  static redemptionAccount(cash: PublicKey, wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(CashProgram.REDEMPTION_PREFIX), cash.toBuffer(), wallet.toBuffer()],
      CashProgram.PUBKEY,
    );
  }
}
