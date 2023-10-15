import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { Deposit, Escrow, Withdraw } from './accounts';

export class CashProgram extends Program {
  static readonly PREFIX = 'cash';
  static readonly PUBKEY = new PublicKey('cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q');

  static async findProgramAuthority(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CashProgram.PREFIX, 'utf8'), CashProgram.PUBKEY.toBuffer()],
      CashProgram.PUBKEY,
    );
  }

  static async findDepositAccount(reference: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Deposit.PREFIX), Buffer.from(reference)],
      CashProgram.PUBKEY,
    );
  }

  static async findWithdrawAccount(reference: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Withdraw.PREFIX), Buffer.from(reference)],
      CashProgram.PUBKEY,
    );
  }

  static async findEscrowAccount(reference: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Escrow.PREFIX), Buffer.from(reference)],
      CashProgram.PUBKEY,
    );
  }

  static async findVaultAccount(escrow: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Escrow.VAULT_PREFIX), escrow.toBuffer()],
      CashProgram.PUBKEY,
    );
  }
}
