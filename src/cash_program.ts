import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { CashLink } from './accounts';

export class CashProgram extends Program {
  static readonly PREFIX = 'cash';
  static readonly FINGERPRINT_PREFIX = 'fingerprint';
  static readonly REFERRAL_REWARD_PREFIX = 'reward';
  static readonly REFERRAL_PREFIX = 'referral';
  static readonly PUBKEY = new PublicKey('cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q');

  static findCashLinkAccount(passKey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(CashLink.PREFIX), passKey.toBuffer()],
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

  static findFingerprintAccount(cashLink: PublicKey, fingerprint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(CashProgram.FINGERPRINT_PREFIX), cashLink.toBuffer(), fingerprint.toBuffer()],
      CashProgram.PUBKEY,
    );
  }
}
