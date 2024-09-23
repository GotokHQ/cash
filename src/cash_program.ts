import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { Cash } from './accounts';

export class CashProgram extends Program {
  static readonly PREFIX = 'cash';
  static readonly FINGERPRINT_PREFIX = 'fingerprint';
  static readonly REWARD_PREFIX = 'reward';
  static readonly WALLET_PREFIX = 'wallet';
  static readonly REFERRAL_PREFIX = 'referral';
  static readonly PUBKEY = new PublicKey('cashXAE5UP18RyU7ByFWfxu93kGg69KzoktacNQDukW');

  static cashAccount(reference: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(Cash.PREFIX), Buffer.from(reference)],
      CashProgram.PUBKEY,
    );
  }

  static rewardAccount(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(CashProgram.REWARD_PREFIX), wallet.toBuffer()],
      CashProgram.PUBKEY,
    );
  }

  static walletAccount(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(CashProgram.WALLET_PREFIX), wallet.toBuffer()],
      CashProgram.PUBKEY,
    );
  }

  static findReferralKey(referrer: PublicKey, referee: PublicKey): [PublicKey, number] {
    const referrerBuffer = referrer.toBuffer();
    const refereeBuffer = referee.toBuffer();

    // Sort the buffers in ascending order
    const sortedBuffers = [referrerBuffer, refereeBuffer].sort(Buffer.compare);

    return PublicKey.findProgramAddressSync(
      [Buffer.from(CashProgram.REFERRAL_PREFIX), sortedBuffers[0], sortedBuffers[1]],
      CashProgram.PUBKEY,
    );
  }

  static findFingerprintAccount(cash: PublicKey, fingerprint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(CashProgram.FINGERPRINT_PREFIX), cash.toBuffer(), fingerprint.toBuffer()],
      CashProgram.PUBKEY,
    );
  }
}
