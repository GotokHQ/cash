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
  SettleCashLinkArgs,
  SettleCashLinkParams,
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

export class EscrowClient {
  private feePayer: Keypair;
  private authority: Keypair;
  private withdrawalWallet: Keypair;
  private feeWallet: PublicKey;
  private fundingWallet: PublicKey;
  private connection: Connection;

  constructor(
    feePayer: Keypair,
    authority: Keypair,
    feeWallet: PublicKey,
    fundingWallet: PublicKey,
    withdrawalWallet: Keypair,
    connection: Connection,
  ) {
    this.feePayer = feePayer;
    this.authority = authority;
    this.feeWallet = feeWallet;
    this.fundingWallet = fundingWallet;
    this.withdrawalWallet = withdrawalWallet;
    this.connection = connection;
  }

  cancel = async (input: CashLinkInput): Promise<string> => {
    const cashLink = await _getCasLinkAccount(this.connection, new PublicKey(input.escrowAddress));
    if (cashLink.data?.state === CashLinkState.Closed) {
      throw new Error(ACCOUNT_ALREADY_CANCELED);
    }
    if (cashLink.data?.state === CashLinkState.Settled) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const payer = new PublicKey(cashLink.data.payer);
    const mint = new PublicKey(cashLink.data.mint);
    const isNative = mint.equals(spl.NATIVE_MINT);
    const cancelInstruction = await this.cancelInstruction({
      mint,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      payerToken: isNative
        ? payer
        : (
            await spl.getOrCreateAssociatedTokenAccount(
              this.connection,
              this.feePayer,
              new PublicKey(cashLink.data.mint),
              payer,
              true,
            )
          ).address,
      vaultToken: new PublicKey(cashLink.data.vaultToken),
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
    const cashLink = await _getCasLinkAccount(this.connection, new PublicKey(input.escrowAddress));
    if (cashLink.data?.state === CashLinkState.Closed) {
      throw new Error(ACCOUNT_ALREADY_CANCELED);
    }
    if (cashLink.data?.state === CashLinkState.Settled) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const payer = new PublicKey(cashLink.data.payer);
    const mint = new PublicKey(cashLink.data.mint);
    const isNative = mint.equals(spl.NATIVE_MINT);
    const cancelInstruction = await this.cancelInstruction({
      mint,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      payerToken: isNative
        ? payer
        : (
            await spl.getOrCreateAssociatedTokenAccount(
              this.connection,
              this.feePayer,
              new PublicKey(cashLink.data.mint),
              payer,
              true,
            )
          ).address,
      vaultToken: new PublicKey(cashLink.data.vaultToken),
      feePayer: this.feePayer.publicKey,
    });
    const closeInstruction = this.closeInstruction({
      cashLink: new PublicKey(input.escrowAddress),
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
        { pubkey: params.payerToken, isSigner: false, isWritable: true },
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
    const cashLink = await _getCasLinkAccount(this.connection, new PublicKey(input.escrowAddress));
    if (
      !(
        cashLink.data?.state === CashLinkState.Initialized ||
        cashLink.data?.state === CashLinkState.Settled
      )
    ) {
      throw new Error(ACCOUNT_NOT_INITIALIZED_OR_SETTLED);
    }
    const closeInstruction = this.closeInstruction({
      cashLink: new PublicKey(input.escrowAddress),
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

  initializeEscrow = async (input: InitializeCashLinkInput): Promise<string> => {
    const payer = new PublicKey(input.wallet);
    const mint = new PublicKey(input.mint);
    const [cashLink, cashLinkBump] = await CashProgram.findCashLinkAccount(input.reference);
    const [vaultTokenAccount, vaultBump] = await CashProgram.findVaultAccount(cashLink);
    const amount = new BN(input.amount);
    const fee = new BN(input.fee ?? 0);
    const escrowParams: InitCashLinkParams = {
      mint,
      payer,
      cashLinkBump,
      vaultBump,
      cashLink,
      vaultToken: vaultTokenAccount,
      amount: amount,
      fee,
      reference: input.reference,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    };

    const transaction = new Transaction();
    transaction.add(this.initInstruction(escrowParams));
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

  initializeEscrowAndPay = async (input: InitializeCashLinkInput): Promise<string> => {
    const payer = new PublicKey(input.wallet);
    const mint = new PublicKey(input.mint);
    const [cashLink, cashLinkBump] = await CashProgram.findCashLinkAccount(input.reference);
    const [vaultTokenAccount, vaultBump] = await CashProgram.findVaultAccount(cashLink);
    const amount = new BN(input.amount);
    const fee = new BN(input.fee ?? 0);
    const total = amount.add(fee);
    const escrowParams: InitCashLinkParams = {
      mint,
      payer,
      cashLinkBump,
      vaultBump,
      cashLink,
      vaultToken: vaultTokenAccount,
      amount: amount,
      fee,
      reference: input.reference,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    };

    const transaction = new Transaction();
    transaction.add(this.initInstruction(escrowParams));
    if (mint.equals(spl.NATIVE_MINT)) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: vaultTokenAccount,
          lamports: total.toNumber(),
        }),
      );
    } else {
      const source = await _findAssociatedTokenAddress(payer, mint);
      transaction.add(
        spl.createTransferInstruction(source, vaultTokenAccount, payer, BigInt(total.toString())),
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
    const escrowAddress = new PublicKey(input.escrowAddress);
    const walletAddress = new PublicKey(input.memo);
    const cashLink = await _getCasLinkAccount(this.connection, escrowAddress);
    if (cashLink.data.state !== CashLinkState.Initialized) {
      throw Error(INVALID_STATE);
    }
    const [vaultTokenAccount] = await CashProgram.findVaultAccount(escrowAddress);
    const mint = new PublicKey(cashLink.data.mint);
    const amount = new BN(cashLink.data.amount);
    const fee = new BN(cashLink.data.fee ?? 0);
    const total = amount.add(fee);
    const transaction = new Transaction();
    if (mint.equals(spl.NATIVE_MINT)) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: walletAddress,
          toPubkey: vaultTokenAccount,
          lamports: total.toNumber(),
        }),
      );
    } else {
      const source = await _findAssociatedTokenAddress(walletAddress, mint);
      transaction.add(
        spl.createTransferInstruction(
          source,
          vaultTokenAccount,
          walletAddress,
          BigInt(total.toString()),
        ),
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
    const {
      amount,
      fee,
      reference,
      payer,
      vaultBump,
      cashLinkBump,
      authority,
      cashLink,
      vaultToken,
      mint,
    } = params;
    const data = InitCashLinkArgs.serialize({
      amount,
      fee,
      reference,
      vaultBump: vaultBump,
      cashLinkBump: cashLinkBump,
    });
    const keys = [
      {
        pubkey: authority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: payer,
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
      {
        pubkey: vaultToken,
        isSigner: false,
        isWritable: true,
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

  settle = async (input: CashLinkInput): Promise<string> => {
    const escrowAddress = new PublicKey(input.escrowAddress);
    const walletAddress = new PublicKey(input.memo);
    const cashLink = await _getCasLinkAccount(this.connection, escrowAddress);
    const transaction = new Transaction();
    const signers = [this.feePayer, this.authority];
    const mint = new PublicKey(cashLink.data.mint);
    const payer = new PublicKey(cashLink.data.payer);
    const isNative = mint.equals(spl.NATIVE_MINT);
    const [destinationToken, feeToken, payerToken] = isNative
      ? [walletAddress, this.feeWallet, payer]
      : (
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
              payer,
              true,
            ),
          ])
        ).map((acc) => acc.address);
    const transactionInstruction = await this.settleInstruction({
      destinationToken,
      feeToken,
      payerToken,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      vaultToken: new PublicKey(cashLink.data.vaultToken),
      mint: mint,
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

  settleAndClose = async (input: CashLinkInput): Promise<string> => {
    const escrowAddress = new PublicKey(input.escrowAddress);
    const walletAddress = new PublicKey(input.walletAddress);
    const cashLink = await _getCasLinkAccount(this.connection, escrowAddress);
    const mint = new PublicKey(cashLink.data.mint);
    const isNative = mint.equals(spl.NATIVE_MINT);
    const payer = new PublicKey(cashLink.data.payer);
    const [destinationToken, feeToken, payerToken] = isNative
      ? [walletAddress, this.feeWallet, payer]
      : (
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
              payer,
              true,
            ),
          ])
        ).map((acc) => acc.address);
    const settleInstruction = await this.settleInstruction({
      destinationToken,
      feeToken,
      payerToken,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      vaultToken: new PublicKey(cashLink.data.vaultToken),
      mint: mint,
      feePayer: this.feePayer.publicKey,
    });
    const closeInstruction = this.closeInstruction({
      cashLink: new PublicKey(input.escrowAddress),
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    });
    const transaction = new Transaction();
    transaction.add(settleInstruction);
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

  settleInstruction = async (params: SettleCashLinkParams): Promise<TransactionInstruction> => {
    return new TransactionInstruction({
      programId: CashProgram.PUBKEY,
      data: SettleCashLinkArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        { pubkey: params.destinationToken, isSigner: false, isWritable: true },
        { pubkey: params.feeToken, isSigner: false, isWritable: true },
        {
          pubkey: params.vaultToken,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: params.cashLink, isSigner: false, isWritable: true },
        { pubkey: params.payerToken, isSigner: false, isWritable: true },
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

  hasPaid = async (escrowAddress: PublicKey, commitment?: Commitment): Promise<boolean> => {
    try {
      const [cashLink, vault] = await Promise.all([
        this.getCashLink(escrowAddress, commitment),
        this.getVault(escrowAddress, commitment),
      ]);
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

  getVault = async (cashLink: PublicKey, commitment?: Commitment): Promise<spl.Account | null> => {
    try {
      const [vault] = await CashProgram.findVaultAccount(cashLink);
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
  escrowAddress: PublicKey,
  commitment?: Commitment,
): Promise<CashLink | null> => {
  try {
    const accountInfo = await connection.getAccountInfo(escrowAddress, commitment);
    if (accountInfo == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const cashLink = CashLink.from(new Account(escrowAddress, accountInfo));
    return cashLink;
  } catch (error) {
    return null;
  }
};
