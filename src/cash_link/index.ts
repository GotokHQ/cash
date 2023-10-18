import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Connection,
  Keypair,
  Commitment,
  RpcResponseAndContext,
  SignatureResult,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import BN from 'bn.js';
import { InitializeCashLinkInput, CashLinkInput } from './types';
import { CashProgram } from '../cash_program';
import { CashLink, CashLinkState } from '../accounts/cash_link';
import {
  CancelCashLinkArgs,
  CancelCashLinkParams,
  InitCashLinkArgs,
  InitCashLinkParams,
  CloseCashLinkArgs,
  CloseCashLinkParams,
  RedeemCashLinkArgs,
  RedeemCashLinkParams,
} from '../transactions';
import { Account } from '@metaplex-foundation/mpl-core';

export const FAILED_TO_FIND_ACCOUNT = 'Failed to find account';
export const INVALID_ACCOUNT_OWNER = 'Invalid account owner';
export const INVALID_AUTHORITY = 'Invalid authority';
export const INVALID_PAYER_ADDRESS = 'Invalid payer address';
export const ACCOUNT_ALREADY_CANCELED = 'Account already canceled';
export const ACCOUNT_ALREADY_SETTLED = 'Account already settled';
export const ACCOUNT_NOT_INITIALIZED_OR_SETTLED = 'Account not initialized or settled';
export const INVALID_SIGNATURE = 'Invalid signature';
export const AMOUNT_MISMATCH = 'Amount mismatch';
export const INVALID_STATE = 'Invalid state';
export const FEE_MISMATCH = 'Fee mismatch';
export const TRANSACTION_SEND_ERROR = 'Transaction send error';
export const MEMO_PROGRAM_ID = new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');

export class CashLinkClient {
  private feePayer: Keypair;
  private authority: Keypair;
  private feeWallet: PublicKey;
  private connection: Connection;

  constructor(feePayer: Keypair, authority: Keypair, feeWallet: PublicKey, connection: Connection) {
    this.feePayer = feePayer;
    this.authority = authority;
    this.feeWallet = feeWallet;
    this.connection = connection;
  }

  cancel = async (input: CashLinkInput): Promise<string> => {
    const cashLinkPda = new PublicKey(input.cashLinkAddress);
    const cashLink = await _getCasLinkAccount(this.connection, cashLinkPda);
    if (cashLink.data?.state === CashLinkState.Closed) {
      throw new Error(ACCOUNT_ALREADY_CANCELED);
    }
    if (cashLink.data?.state === CashLinkState.Redeemed) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const sender = new PublicKey(cashLink.data.sender);
    const mint = new PublicKey(cashLink.data.mint);
    const cancelInstruction = await this.cancelInstruction({
      mint,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      senderToken: (
        await spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          mint,
          sender,
          true,
        )
      ).address,
      vaultToken: await _findAssociatedTokenAddress(cashLinkPda, mint),
      feePayer: this.feePayer.publicKey,
    });
    const transaction = new Transaction().add(cancelInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    try {
      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      return signature;
    } catch (error) {
      throw new Error(TRANSACTION_SEND_ERROR);
    }
  };

  cancelAndClose = async (input: CashLinkInput): Promise<string> => {
    const cashLinkPda = new PublicKey(input.cashLinkAddress);
    const cashLink = await _getCasLinkAccount(this.connection, cashLinkPda);
    if (cashLink.data?.state === CashLinkState.Closed) {
      throw new Error(ACCOUNT_ALREADY_CANCELED);
    }
    if (cashLink.data?.state === CashLinkState.Redeemed) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const sender = new PublicKey(cashLink.data.sender);
    const mint = new PublicKey(cashLink.data.mint);
    const cancelInstruction = await this.cancelInstruction({
      mint,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      senderToken: (
        await spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          mint,
          sender,
          true,
        )
      ).address,
      vaultToken: await _findAssociatedTokenAddress(cashLinkPda, mint),
      feePayer: this.feePayer.publicKey,
    });
    const closeInstruction = this.closeInstruction({
      cashLink: new PublicKey(input.cashLinkAddress),
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    });
    const transaction = new Transaction().add(cancelInstruction, closeInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    try {
      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      return signature;
    } catch (error) {
      throw new Error(TRANSACTION_SEND_ERROR);
    }
  };

  cancelInstruction = async (params: CancelCashLinkParams): Promise<TransactionInstruction> => {
    return new TransactionInstruction({
      programId: CashProgram.PUBKEY,
      data: CancelCashLinkArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        { pubkey: params.cashLink, isSigner: false, isWritable: true },
        { pubkey: params.senderToken, isSigner: false, isWritable: true },
        { pubkey: params.vaultToken, isSigner: false, isWritable: true },
        { pubkey: params.feePayer, isSigner: true, isWritable: true },
        { pubkey: params.mint, isSigner: false, isWritable: false },
        {
          pubkey: SYSVAR_CLOCK_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: spl.TOKEN_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  close = async (input: CashLinkInput): Promise<string> => {
    const cashLink = await _getCasLinkAccount(
      this.connection,
      new PublicKey(input.cashLinkAddress),
    );
    if (
      !(
        cashLink.data?.state === CashLinkState.Initialized ||
        cashLink.data?.state === CashLinkState.Redeemed
      )
    ) {
      throw new Error(ACCOUNT_NOT_INITIALIZED_OR_SETTLED);
    }
    const closeInstruction = this.closeInstruction({
      cashLink: new PublicKey(input.cashLinkAddress),
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    });
    const transaction = new Transaction().add(closeInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    return await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
    });
  };

  closeInstruction = (params: CloseCashLinkParams): TransactionInstruction => {
    return new TransactionInstruction({
      programId: CashProgram.PUBKEY,
      data: CloseCashLinkArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        {
          pubkey: params.cashLink,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: params.feePayer, isSigner: false, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  initialize = async (input: InitializeCashLinkInput): Promise<string> => {
    const sender = new PublicKey(input.wallet);
    const mint = new PublicKey(input.mint);
    const reference = new PublicKey(input.reference);
    const [cashLink, cashLinkBump] = await CashProgram.findCashLinkAccount(reference);
    const vaultToken = await _findAssociatedTokenAddress(cashLink, mint);
    const amount = new BN(input.amount);
    const fee = new BN(input.fee ?? 0);
    const initParams: InitCashLinkParams = {
      mint,
      sender,
      cashLinkBump,
      cashLink,
      vaultToken,
      amount: amount,
      fee,
      reference,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    };

    const transaction = new Transaction();
    transaction.add(this.initInstruction(initParams));
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    const { blockhash } = await this.connection.getLatestBlockhash(input.commitment ?? 'finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer, this.authority);
    return transaction
      .serialize({
        requireAllSignatures: false,
      })
      .toString('base64');
  };

  initializeAndPay = async (input: InitializeCashLinkInput): Promise<string> => {
    const sender = new PublicKey(input.wallet);
    const mint = new PublicKey(input.mint);
    const reference = new PublicKey(input.reference);
    const [cashLink, cashLinkBump] = await CashProgram.findCashLinkAccount(reference);
    const vaultToken = await _findAssociatedTokenAddress(cashLink, mint);
    const amount = new BN(input.amount);
    const fee = new BN(input.fee ?? 0);
    const total = amount.add(fee);
    const initParams: InitCashLinkParams = {
      mint,
      sender,
      cashLinkBump,
      cashLink,
      vaultToken,
      amount: amount,
      fee,
      reference,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    };

    const transaction = new Transaction();
    transaction.add(this.initInstruction(initParams));
    if (mint.equals(spl.NATIVE_MINT)) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: sender,
          toPubkey: vaultToken,
          lamports: total.toNumber(),
        }),
      );
    } else {
      const source = await _findAssociatedTokenAddress(sender, mint);
      transaction.add(
        spl.createTransferInstruction(source, vaultToken, sender, BigInt(total.toString())),
      );
    }
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    const { blockhash } = await this.connection.getLatestBlockhash(input.commitment ?? 'finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer, this.authority);
    return transaction
      .serialize({
        requireAllSignatures: false,
      })
      .toString('base64');
  };

  pay = async (input: CashLinkInput): Promise<string> => {
    const cashLinkAddress = new PublicKey(input.cashLinkAddress);
    const walletAddress = new PublicKey(input.memo);
    const cashLink = await _getCasLinkAccount(this.connection, cashLinkAddress);
    if (cashLink.data.state !== CashLinkState.Initialized) {
      throw Error(INVALID_STATE);
    }
    const mint = new PublicKey(cashLink.data.mint);
    const vaultToken = await _findAssociatedTokenAddress(cashLinkAddress, mint);
    const amount = new BN(cashLink.data.amount);
    const fee = new BN(cashLink.data.fee ?? 0);
    const total = amount.add(fee);
    const transaction = new Transaction();
    if (mint.equals(spl.NATIVE_MINT)) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: walletAddress,
          toPubkey: vaultToken,
          lamports: total.toNumber(),
        }),
      );
    } else {
      const source = await _findAssociatedTokenAddress(walletAddress, mint);
      transaction.add(
        spl.createTransferInstruction(source, vaultToken, walletAddress, BigInt(total.toString())),
      );
    }
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    const { blockhash } = await this.connection.getLatestBlockhash(input.commitment ?? 'finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer, this.authority);
    return transaction
      .serialize({
        requireAllSignatures: false,
      })
      .toString('base64');
  };

  initInstruction = (params: InitCashLinkParams): TransactionInstruction => {
    const { amount, fee, reference, sender, cashLinkBump, authority, cashLink, vaultToken, mint } =
      params;
    const data = InitCashLinkArgs.serialize({
      amount,
      fee,
      cashLinkBump: cashLinkBump,
    });
    const keys = [
      {
        pubkey: authority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: sender,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: this.feePayer.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: cashLink,
        isSigner: false,
        isWritable: true,
      },
      // {
      //   pubkey: vaultToken,
      //   isSigner: false,
      //   isWritable: true,
      // },
      {
        pubkey: reference,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: spl.TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ];
    return new TransactionInstruction({
      keys,
      data,
      programId: CashProgram.PUBKEY,
    });
  };

  send = async (payload: string): Promise<string> => {
    const buffer = Buffer.from(payload, 'base64');
    const txIx = Transaction.from(buffer);
    if (!txIx.verifySignatures()) {
      throw Error(INVALID_SIGNATURE);
    }
    return this.connection.sendRawTransaction(buffer, {
      skipPreflight: false,
    });
  };

  confirmTransaction = async (
    signature: string,
    commitment?: Commitment,
  ): Promise<RpcResponseAndContext<SignatureResult>> => {
    const latestBlockhash = await this.connection.getLatestBlockhash(commitment);
    return await this.connection.confirmTransaction(
      {
        ...latestBlockhash,
        signature,
      },
      commitment,
    );
  };

  redeem = async (input: CashLinkInput): Promise<string> => {
    const cashLinkAddress = new PublicKey(input.cashLinkAddress);
    const recipient = new PublicKey(input.walletAddress);
    const cashLink = await _getCasLinkAccount(this.connection, cashLinkAddress);
    const transaction = new Transaction();
    const signers = [this.feePayer, this.authority];
    const mint = new PublicKey(cashLink.data.mint);
    const sender = new PublicKey(cashLink.data.sender);
    const vaultToken = await _findAssociatedTokenAddress(cashLinkAddress, mint);
    const [recipientToken, feeToken, senderToken] = (
      await Promise.all([
        spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          new PublicKey(cashLink.data.mint),
          recipient,
          true,
        ),
        spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          new PublicKey(cashLink.data.mint),
          this.feeWallet,
          true,
        ),
        spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          new PublicKey(cashLink.data.mint),
          sender,
          true,
        ),
      ])
    ).map((acc) => acc.address);
    const transactionInstruction = await this.redeemInstruction({
      recipientToken,
      feeToken,
      senderToken,
      vaultToken,
      mint,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      feePayer: this.feePayer.publicKey,
    });
    transaction.add(transactionInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(...signers);
    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
    });
    return signature;
  };

  redeemAndClose = async (input: CashLinkInput): Promise<string> => {
    const cashLinkAddress = new PublicKey(input.cashLinkAddress);
    const walletAddress = new PublicKey(input.walletAddress);
    const cashLink = await _getCasLinkAccount(this.connection, cashLinkAddress);
    const mint = new PublicKey(cashLink.data.mint);
    const vaultToken = await _findAssociatedTokenAddress(cashLinkAddress, mint);
    const sender = new PublicKey(cashLink.data.sender);
    const [recipientToken, feeToken, senderToken] = (
      await Promise.all([
        spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          new PublicKey(cashLink.data.mint),
          walletAddress,
          true,
        ),
        spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          new PublicKey(cashLink.data.mint),
          this.feeWallet,
          true,
        ),
        spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          new PublicKey(cashLink.data.mint),
          sender,
          true,
        ),
      ])
    ).map((acc) => acc.address);
    const redeemInstruction = await this.redeemInstruction({
      recipientToken,
      feeToken,
      senderToken,
      vaultToken,
      mint,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      feePayer: this.feePayer.publicKey,
    });
    const closeInstruction = this.closeInstruction({
      cashLink: new PublicKey(input.cashLinkAddress),
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    });
    const transaction = new Transaction();
    transaction.add(redeemInstruction);
    transaction.add(closeInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    try {
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
      });
      return signature;
    } catch (error) {
      throw new Error(TRANSACTION_SEND_ERROR);
    }
  };

  redeemInstruction = async (params: RedeemCashLinkParams): Promise<TransactionInstruction> => {
    return new TransactionInstruction({
      programId: CashProgram.PUBKEY,
      data: RedeemCashLinkArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        { pubkey: params.recipientToken, isSigner: false, isWritable: true },
        { pubkey: params.feeToken, isSigner: false, isWritable: true },
        {
          pubkey: params.vaultToken,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: params.cashLink, isSigner: false, isWritable: true },
        { pubkey: params.senderToken, isSigner: false, isWritable: true },
        { pubkey: params.feePayer, isSigner: true, isWritable: false },
        { pubkey: params.mint, isSigner: false, isWritable: false },
        {
          pubkey: SYSVAR_CLOCK_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: spl.TOKEN_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  signTransaction = (transaction: Transaction): Buffer => {
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer);
    return transaction.serialize();
  };

  memoInstruction = (memo: string, signer?: PublicKey) => {
    const keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
    if (signer) {
      keys.push({ pubkey: signer, isSigner: true, isWritable: false });
    }
    return new TransactionInstruction({
      keys: keys,
      data: Buffer.from(memo, 'utf-8'),
      programId: MEMO_PROGRAM_ID,
    });
  };

  hasPaid = async (cashLinkAddress: PublicKey, commitment?: Commitment): Promise<boolean> => {
    try {
      const cashLink = await this.getCashLink(cashLinkAddress, commitment);
      const vault = await this.getVault(
        cashLinkAddress,
        new PublicKey(cashLink.data.mint),
        commitment,
      );
      if (!cashLink || !cashLink.data || !vault) {
        return false;
      }
      const amount = new BN(cashLink.data.amount ?? 0);
      const fee = new BN(cashLink.data.fee ?? 0);
      const total = amount.add(fee);
      const vaultAmount = new BN(vault.amount.toString());
      return vaultAmount.gte(total);
    } catch (error: unknown) {
      throw error;
    }
  };

  getVault = async (
    cashLink: PublicKey,
    mint: PublicKey,
    commitment?: Commitment,
  ): Promise<spl.Account | null> => {
    try {
      const vault = await _findAssociatedTokenAddress(cashLink, mint);
      return await spl.getAccount(this.connection, vault, commitment);
    } catch (error: unknown) {
      if (
        error instanceof spl.TokenAccountNotFoundError ||
        error instanceof spl.TokenInvalidAccountOwnerError
      ) {
        return null;
      }
      throw error;
    }
  };

  getCashLink = async (address: PublicKey, commitment?: Commitment): Promise<CashLink | null> => {
    try {
      return await _getCasLinkAccount(this.connection, address, commitment);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
        return null;
      }
      throw error;
    }
  };
}

const _findAssociatedTokenAddress = async (
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey,
) => {
  return (
    await PublicKey.findProgramAddress(
      [walletAddress.toBuffer(), spl.TOKEN_PROGRAM_ID.toBuffer(), tokenMintAddress.toBuffer()],
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
  )[0];
};

const _getCasLinkAccount = async (
  connection: Connection,
  cashLinkAddress: PublicKey,
  commitment?: Commitment,
): Promise<CashLink | null> => {
  try {
    const accountInfo = await connection.getAccountInfo(cashLinkAddress, commitment);
    if (accountInfo == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const cashLink = CashLink.from(new Account(cashLinkAddress, accountInfo));
    return cashLink;
  } catch (error) {
    return null;
  }
};
