import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SystemProgram,
  Connection,
  Keypair,
  Commitment,
  RpcResponseAndContext,
  SignatureResult,
  ComputeBudgetProgram,
  AddressLookupTableAccount,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
  // TransactionMessage,
  // VersionedTransaction,
  // AddressLookupTableProgram,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import BN from 'bn.js';
import { InitializeCashInput, ResultContext, CashInput, RedeemCashInput } from './types';
import { CashProgram } from '../cash_program';
import { Cash, CashState } from '../accounts/cash';
import {
  CancelCashArgs,
  CancelCashParams,
  InitCashArgs,
  InitCashParams,
  CloseCashArgs,
  CloseCashParams,
  RedeemCashLinkArgs,
  RedeemCashLinkParams,
} from '../transactions';
import { Account } from '@metaplex-foundation/mpl-core';

export const FAILED_TO_FIND_ACCOUNT = 'Failed to find account';
export const INVALID_ACCOUNT_OWNER = 'Invalid account owner';
export const INVALID_AUTHORITY = 'Invalid _authority';
export const INVALID_PAYER_ADDRESS = 'Invalid payer address';
export const ACCOUNT_ALREADY_CANCELED = 'Account already canceled';
export const ACCOUNT_ALREADY_SETTLED = 'Account already settled';
export const ACCOUNT_NOT_INITIALIZED_OR_SETTLED = 'Account not initialized or settled';
export const ACCOUNT_NOT_CANCELED = 'Account not canceled';
export const ACCOUNT_HAS_REDEMPTIONS = 'Account has redemptions';
export const INVALID_SIGNATURE = 'Invalid signature';
export const AMOUNT_MISMATCH = 'Amount mismatch';
export const INVALID_STATE = 'Invalid state';
export const FEE_MISMATCH = 'Fee mismatch';
export const TRANSACTION_SEND_ERROR = 'Transaction send error';
export const FINGERPRINT_NOT_FOUND = 'Fingerprint required';
export const REFERRER_WALLET = 'Referrer required';

export const kTokenProgramRent = 2039280;

export class CashClient {
  private _feePayer: Keypair;
  private _authority: Keypair;
  private _feeWallet: PublicKey;
  private connection: Connection;
  private computeUnit?: number;
  private computePriorityFee?: number;
  constructor(
    feePayer: Keypair,
    authority: Keypair,
    feeWallet: PublicKey,
    connection: Connection,
    computeUnit?: number,
    computePriorityFee?: number,
  ) {
    this._feePayer = feePayer;
    this._authority = authority;
    this._feeWallet = feeWallet;
    this.connection = connection;
    this.computePriorityFee = computePriorityFee;
    this.computeUnit = computeUnit;
  }

  get feePayer(): PublicKey {
    return this._feePayer.publicKey;
  }

  get authority(): PublicKey {
    return this._authority.publicKey;
  }

  get feeWallet(): PublicKey {
    return this._feeWallet;
  }

  cancel = async (input: CashInput): Promise<ResultContext> => {
    const [cashAddress, bump] = CashProgram.cashAccount(input.cashReference);
    const cash = await _getCashAccount(this.connection, cashAddress);
    if (cash == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const { instructions, signers } = await this.cancelTransaction(cash, bump, input);
    if (input.computeBudget) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    signers.push(this._feePayer, this._authority);
    if (input.asLegacyTransaction) {
      const transaction = new Transaction();
      transaction.recentBlockhash = value.blockhash;
      transaction.lastValidBlockHeight = value.lastValidBlockHeight;
      transaction.add(...instructions);
      transaction.feePayer = this.feePayer;
      transaction.partialSign(...signers);
      return {
        transaction: transaction
          .serialize({
            requireAllSignatures: false,
          })
          .toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    } else {
      let lookUpTable: AddressLookupTableAccount | undefined;
      if (input.addressLookupTable) {
        const lookUpTableAddresses = new PublicKey(input.addressLookupTable);
        lookUpTable = (await this.connection.getAddressLookupTable(lookUpTableAddresses)).value;
      }
      const messageV0 = new TransactionMessage({
        payerKey: this.feePayer,
        recentBlockhash: value.blockhash,
        instructions,
      }).compileToV0Message([lookUpTable]);
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign(signers);
      return {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    }
  };

  cancelAndClose = async (input: CashInput): Promise<ResultContext> => {
    const [cashAddress, bump] = CashProgram.cashAccount(input.cashReference);
    const cash = await _getCashAccount(this.connection, cashAddress);
    if (cash == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const { instructions, signers } = await this.cancelTransaction(cash, bump, input);
    if (cash.data.totalRedemptions === 0) {
      const closeInstruction = this.closeInstruction({
        cash: cashAddress,
        authority: this.authority,
        destinationWallet: this.feePayer,
      });
      instructions.push(closeInstruction);
    }
    if (input.computeBudget) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    signers.push(this._feePayer, this._authority);
    if (input.asLegacyTransaction) {
      const transaction = new Transaction();
      transaction.recentBlockhash = value.blockhash;
      transaction.lastValidBlockHeight = value.lastValidBlockHeight;
      transaction.add(...instructions);
      transaction.feePayer = this.feePayer;
      transaction.partialSign(...signers);
      return {
        transaction: transaction
          .serialize({
            requireAllSignatures: false,
          })
          .toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    } else {
      let lookUpTable: AddressLookupTableAccount | undefined;
      if (input.addressLookupTable) {
        const lookUpTableAddresses = new PublicKey(input.addressLookupTable);
        lookUpTable = (await this.connection.getAddressLookupTable(lookUpTableAddresses)).value;
      }
      const messageV0 = new TransactionMessage({
        payerKey: this.feePayer,
        recentBlockhash: value.blockhash,
        instructions,
      }).compileToV0Message([lookUpTable]);
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign(signers);
      return {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    }
  };

  cancelTransaction = async (
    cash: Cash,
    cashBump: number,
    input: CashInput,
  ): Promise<{
    instructions: TransactionInstruction[];
    signers: Keypair[];
  }> => {
    if (cash.data?.state === CashState.Canceled) {
      throw new Error(ACCOUNT_ALREADY_CANCELED);
    }
    if (cash.data?.state === CashState.Redeemed) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const owner = new PublicKey(cash.data.owner);
    const mint = new PublicKey(cash.data.mint);
    const programId = new PublicKey(input.tokenProgramId);
    const isNativeToken = mint.equals(spl.NATIVE_MINT) || mint.equals(spl.NATIVE_MINT_2022);
    const ownerTokenAccount = isNativeToken
      ? owner
      : spl.getAssociatedTokenAddressSync(mint, owner, true, programId);
    const instructions = [];
    const cancelInstruction = await this.cancelInstruction({
      authority: this.authority,
      cash: cash.pubkey,
      ownerToken: ownerTokenAccount,
      vaultToken: spl.getAssociatedTokenAddressSync(mint, cash.pubkey, true, programId),
      feePayer: this.feePayer,
      tokenProgramId: new PublicKey(input.tokenProgramId),
      cashBump,
      mint,
      cashReference: input.cashReference,
    });
    instructions.push(cancelInstruction);
    return {
      instructions,
      signers: [],
    };
  };

  cancelInstruction = async (params: CancelCashParams): Promise<TransactionInstruction> => {
    const keys = [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.cash, isSigner: false, isWritable: true },
      { pubkey: params.ownerToken, isSigner: false, isWritable: true },
      { pubkey: params.feePayer, isSigner: false, isWritable: true },
      {
        pubkey: params.vaultToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: params.mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: params.tokenProgramId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ];
    return new TransactionInstruction({
      keys,
      programId: CashProgram.PUBKEY,
      data: CancelCashArgs.serialize({
        cashBump: params.cashBump,
        cashReference: params.cashReference,
      }),
    });
  };

  lookUpTableAddresses = () => {
    return [
      this.feePayer,
      this.authority,
      this.feeWallet,
      SystemProgram.programId,
      spl.TOKEN_PROGRAM_ID,
      spl.TOKEN_2022_PROGRAM_ID,
      SYSVAR_CLOCK_PUBKEY,
      ComputeBudgetProgram.programId,
      CashProgram.PUBKEY,
      SYSVAR_RENT_PUBKEY,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      SYSVAR_SLOT_HASHES_PUBKEY,
    ];
  };

  close = async (input: CashInput): Promise<ResultContext> => {
    const [cashAddress] = CashProgram.cashAccount(input.cashReference);
    const cash = await _getCashAccount(this.connection, cashAddress);
    if (cash == null || !cash.data) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    if (cash.data.state !== CashState.Canceled) {
      throw new Error(ACCOUNT_NOT_CANCELED);
    }
    if (cash.data.totalRedemptions !== 0) {
      throw new Error(ACCOUNT_HAS_REDEMPTIONS);
    }
    const instructions = [
      this.closeInstruction({
        cash: cashAddress,
        authority: this.authority,
        destinationWallet: this.feePayer,
      }),
    ];
    if (input.computeBudget) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    const signers = [this._feePayer, this._authority];
    if (input.asLegacyTransaction) {
      const transaction = new Transaction();
      transaction.recentBlockhash = value.blockhash;
      transaction.lastValidBlockHeight = value.lastValidBlockHeight;
      transaction.add(...instructions);
      transaction.feePayer = this.feePayer;
      transaction.partialSign(...signers);
      return {
        transaction: transaction
          .serialize({
            requireAllSignatures: false,
          })
          .toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    } else {
      let lookUpTable: AddressLookupTableAccount | undefined;
      if (input.addressLookupTable) {
        const lookUpTableAddresses = new PublicKey(input.addressLookupTable);
        lookUpTable = (await this.connection.getAddressLookupTable(lookUpTableAddresses)).value;
      }
      const messageV0 = new TransactionMessage({
        payerKey: this.feePayer,
        recentBlockhash: value.blockhash,
        instructions,
      }).compileToV0Message([lookUpTable]);
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign(signers);
      return {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    }
  };

  closeInstruction = (params: CloseCashParams): TransactionInstruction => {
    return new TransactionInstruction({
      programId: CashProgram.PUBKEY,
      data: CloseCashArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        {
          pubkey: params.cash,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: params.destinationWallet, isSigner: false, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  initialize = async (input: InitializeCashInput): Promise<ResultContext> => {
    const { instructions, signers } = await this.initializeTransaction(input);
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    if (input.computeBudget) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    signers.push(this._feePayer, this._authority);
    if (input.asLegacyTransaction) {
      const transaction = new Transaction();
      transaction.recentBlockhash = value.blockhash;
      transaction.lastValidBlockHeight = value.lastValidBlockHeight;
      transaction.add(...instructions);
      transaction.feePayer = this.feePayer;
      transaction.partialSign(...signers);
      return {
        transaction: transaction
          .serialize({
            requireAllSignatures: false,
          })
          .toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    } else {
      let lookUpTable: AddressLookupTableAccount | undefined;
      if (input.addressLookupTable) {
        const lookUpTableAddresses = new PublicKey(input.addressLookupTable);
        lookUpTable = (await this.connection.getAddressLookupTable(lookUpTableAddresses)).value;
      }
      const messageV0 = new TransactionMessage({
        payerKey: this.feePayer,
        recentBlockhash: value.blockhash,
        instructions,
      }).compileToV0Message([lookUpTable]);
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign(signers);
      return {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    }
  };

  initializeTransaction = async (
    input: InitializeCashInput,
  ): Promise<{
    instructions: TransactionInstruction[];
    signers: Keypair[];
  }> => {
    const owner = new PublicKey(input.wallet);
    const mint: PublicKey = new PublicKey(input.mint);
    const passKey = input.passKey ? new PublicKey(input.passKey) : undefined;
    const tokenProgramId = new PublicKey(input.tokenProgramId);
    const [cash, cashBump] = CashProgram.cashAccount(input.cashReference);
    const amount = new BN(input.amount);
    const networkFee = new BN(input.networkFee ?? 0);
    const rentFeeToRedeem = new BN(input.rentFeeToRedeem ?? 0);
    const baseFeeToRedeem = new BN(input.baseFeeToRedeem ?? 0);
    const feeBps = input.feeBps ?? 0;
    const maxNumRedemptions = input.maxNumRedemptions;
    const minAmount = input.minAmount ? new BN(input.minAmount) : undefined;
    const ownerTokenAccount = spl.getAssociatedTokenAddressSync(mint, owner, true, tokenProgramId);
    const initParams: InitCashParams = {
      mint,
      owner,
      cashBump,
      cash,
      feeBps,
      networkFee,
      rentFeeToRedeem,
      baseFeeToRedeem,
      maxNumRedemptions,
      ownerTokenAccount,
      minAmount,
      passKey,
      amount: amount,
      authority: this.authority,
      feePayer: this.feePayer,
      distributionType: input.distributionType,
      fingerprintEnabled: input.fingerprintEnabled,
      tokenProgramId: tokenProgramId,
      cashReference: input.cashReference,
    };
    const instructions = [];
    instructions.push(await this.initInstruction(initParams));
    const signers = [];
    return {
      instructions,
      signers,
    };
  };

  initInstruction = (params: InitCashParams): TransactionInstruction => {
    const data = InitCashArgs.serialize({
      amount: params.amount,
      feeBps: params.feeBps,
      networkFee: params.networkFee,
      rentFeeToRedeem: params.rentFeeToRedeem,
      baseFeeToRedeem: params.baseFeeToRedeem,
      cashBump: params.cashBump,
      distributionType: params.distributionType,
      maxNumRedemptions: params.maxNumRedemptions,
      minAmount: params.minAmount,
      isLocked: !!params.passKey,
      cashReference: params.cashReference,
    });
    const keys = [
      {
        pubkey: params.authority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: params.owner,
        isSigner: true,
        isWritable: !params.mint,
      },
      {
        pubkey: this.feePayer,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: params.cash,
        isSigner: false,
        isWritable: true,
      },
      ...(params.passKey
        ? [
            {
              pubkey: params.passKey,
              isSigner: false,
              isWritable: false,
            },
          ]
        : []),
      {
        pubkey: params.mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: spl.getAssociatedTokenAddressSync(
          params.mint,
          params.cash,
          true,
          params.tokenProgramId,
        ),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: params.ownerTokenAccount,
        isSigner: false,
        isWritable: true,
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
        pubkey: params.tokenProgramId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
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
    commitment: Commitment = 'confirmed',
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

  redeem = async (input: RedeemCashInput): Promise<ResultContext> => {
    const { instructions, signers } = await this.redeemTransaction(input);
    if (input.computeBudget) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    signers.push(this._feePayer, this._authority);
    if (input.asLegacyTransaction) {
      const transaction = new Transaction();
      transaction.feePayer = this.feePayer;
      transaction.recentBlockhash = value.blockhash;
      transaction.lastValidBlockHeight = value.lastValidBlockHeight;
      transaction.add(...instructions);
      transaction.partialSign(...signers);
      return {
        transaction: transaction
          .serialize({
            requireAllSignatures: false,
          })
          .toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    } else {
      let lookUpTable: AddressLookupTableAccount | undefined;
      if (input.addressLookupTable) {
        const lookUpTableAddresses = new PublicKey(input.addressLookupTable);
        lookUpTable = (await this.connection.getAddressLookupTable(lookUpTableAddresses)).value;
      }
      const messageV0 = new TransactionMessage({
        payerKey: this.feePayer,
        recentBlockhash: value.blockhash,
        instructions,
      }).compileToV0Message([lookUpTable]);

      const transaction = new VersionedTransaction(messageV0);
      transaction.sign(signers);
      return {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        slot: context.slot,
        asLegacyTransaction: input.asLegacyTransaction,
      };
    }
  };

  redeemTransaction = async (
    input: RedeemCashInput,
  ): Promise<{
    instructions: TransactionInstruction[];
    signers: Keypair[];
  }> => {
    const passKey = input.passKey ? new PublicKey(input.passKey) : undefined;
    const tokenProgramId = new PublicKey(input.tokenProgramId);
    const [cashLinkAddress, cashBump] = CashProgram.cashAccount(input.cashReference);
    const cash = await _getCashAccount(this.connection, cashLinkAddress, input.commitment);
    if (cash == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    if (input.referrerFeeBps && !input.referrer) {
      throw new Error(REFERRER_WALLET);
    }
    const walletAddress = new PublicKey(input.walletAddress);
    const owner = new PublicKey(cash.data.owner);
    const mint = new PublicKey(cash.data.mint);
    const vaultToken = spl.getAssociatedTokenAddressSync(
      mint,
      cashLinkAddress,
      true,
      tokenProgramId,
    );
    let referrer: PublicKey | undefined;
    let referrerToken: PublicKey | undefined;
    if (input.referrerFeeBps) {
      referrer = new PublicKey(input.referrer);
      referrerToken = spl.getAssociatedTokenAddressSync(mint, referrer, true, tokenProgramId);
    }

    const isNativeToken = mint.equals(spl.NATIVE_MINT) || mint.equals(spl.NATIVE_MINT_2022);
    const unwrapTokenAccount = isNativeToken ? Keypair.generate() : null;

    const instructions = [
      ...(isNativeToken
        ? [
            SystemProgram.createAccount({
              fromPubkey: this.feePayer,
              newAccountPubkey: unwrapTokenAccount.publicKey,
              lamports: kTokenProgramRent,
              space: spl.ACCOUNT_SIZE,
              programId: tokenProgramId,
            }),
            spl.createInitializeAccount3Instruction(
              unwrapTokenAccount.publicKey,
              mint,
              walletAddress,
              tokenProgramId,
            ),
          ]
        : []),
    ];
    const walletTokenAccount = isNativeToken
      ? unwrapTokenAccount.publicKey
      : spl.getAssociatedTokenAddressSync(mint, walletAddress, true, tokenProgramId);
    const ownerTokenAccount = isNativeToken
      ? owner
      : await this.getOrCreateAssociatedAccount(mint, owner, tokenProgramId, input.commitment);
    const feeTokenAccount = await this.getOrCreateAssociatedAccount(
      mint,
      this.feeWallet,
      tokenProgramId,
      input.commitment,
    );
    const feePayerTokenAccount = await this.getOrCreateAssociatedAccount(
      mint,
      this.feePayer,
      tokenProgramId,
      input.commitment,
    );
    const redeemInstruction = await this.redeemInstruction({
      mint,
      cashBump,
      passKey,
      wallet: walletAddress,
      walletToken: walletTokenAccount,
      platformFeeToken: feeTokenAccount,
      ownerToken: ownerTokenAccount,
      feePayerToken: feePayerTokenAccount,
      vaultToken,
      authority: this.authority,
      cash: cash.pubkey,
      feePayer: this.feePayer,
      referrer,
      referrerToken,
      tokenProgramId,
      refereeFeeBps: input.refereeFeeBps,
      referrerFeeBps: input.referrerFeeBps,
      cashReference: input.cashReference,
      weightPpm: input.weightPpm,
    });
    instructions.push(redeemInstruction);
    if (isNativeToken) {
      instructions.push(
        spl.createCloseAccountInstruction(
          unwrapTokenAccount.publicKey,
          walletAddress,
          walletAddress,
          [],
          tokenProgramId,
        ),
        SystemProgram.transfer({
          fromPubkey: walletAddress,
          toPubkey: this.feePayer,
          lamports: kTokenProgramRent,
        }),
      );
    }
    const signers = isNativeToken ? [unwrapTokenAccount] : [];
    return {
      instructions,
      signers,
    };
  };

  redeemInstruction = async (params: RedeemCashLinkParams): Promise<TransactionInstruction> => {
    const {
      authority,
      wallet,
      platformFeeToken,
      cash,
      passKey,
      ownerToken,
      feePayer,
      feePayerToken,
      vaultToken,
      walletToken,
      mint,
      referrer,
      referrerToken,
      tokenProgramId,
      cashBump,
      refereeFeeBps,
      cashReference,
      weightPpm,
      rateUsd,
    } = params;

    const keys = [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: wallet, isSigner: false, isWritable: true },
      { pubkey: platformFeeToken, isSigner: false, isWritable: true },
      { pubkey: cash, isSigner: false, isWritable: true },
      ...(passKey ? [{ pubkey: passKey, isSigner: true, isWritable: false }] : []),
      { pubkey: ownerToken, isSigner: false, isWritable: true },
      { pubkey: feePayer, isSigner: true, isWritable: true },
      { pubkey: feePayerToken, isSigner: false, isWritable: true },
      { pubkey: vaultToken, isSigner: false, isWritable: true },
      { pubkey: walletToken, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      ...(referrer
        ? [
            { pubkey: referrer, isSigner: false, isWritable: true },
            { pubkey: referrerToken, isSigner: false, isWritable: true },
          ]
        : []),
      { pubkey: spl.ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const data = RedeemCashLinkArgs.serialize({
      cashBump,
      refereeFeeBps,
      cashReference,
      weightPpm,
      rateUsd,
    });

    return new TransactionInstruction({
      keys,
      programId: CashProgram.PUBKEY,
      data,
    });
  };

  signTransaction = (transaction: Transaction): Buffer => {
    transaction.feePayer = this.feePayer;
    transaction.partialSign(this._feePayer);
    return transaction.serialize();
  };

  getVault = async (
    cash: PublicKey,
    mint: PublicKey,
    tokenProgramId: PublicKey,
    commitment?: Commitment,
  ): Promise<spl.Account | null> => {
    try {
      const vault = spl.getAssociatedTokenAddressSync(mint, cash, true, tokenProgramId);
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

  getCash = async (address: PublicKey, commitment?: Commitment): Promise<Cash | null> => {
    try {
      return await _getCashAccount(this.connection, address, commitment);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
        return null;
      }
      throw error;
    }
  };

  getOrCreateAssociatedAccount = async (
    mint: PublicKey,
    owner: PublicKey,
    tokenProgramId: PublicKey,
    commitment?: Commitment,
  ): Promise<PublicKey> => {
    try {
      const associatedToken = spl.getAssociatedTokenAddressSync(mint, owner, true, tokenProgramId);
      const acc = await this._getAccount(associatedToken, tokenProgramId, commitment);
      if (acc === null) {
        const instruction = spl.createAssociatedTokenAccountInstruction(
          this.feePayer,
          associatedToken,
          owner,
          mint,
          tokenProgramId,
        );
        const { value } = await this.connection.getLatestBlockhashAndContext(commitment);
        const transaction = new Transaction();
        transaction.feePayer = this.feePayer;
        transaction.lastValidBlockHeight = value.lastValidBlockHeight;
        transaction.recentBlockhash = value.blockhash;
        if (this.computeUnit) {
          transaction.add(
            ComputeBudgetProgram.setComputeUnitLimit({
              units: this.computeUnit,
            }),
          );
        }
        if (this.computePriorityFee) {
          transaction.add(
            ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: this.computePriorityFee,
            }),
          );
        }
        transaction.add(instruction);
        await sendAndConfirmTransaction(this.connection, transaction, [this._feePayer], {
          commitment,
        });
        return associatedToken;
      }
      return acc.address;
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

  _getAccount = async (
    account: PublicKey,
    programId: PublicKey,
    commitment?: Commitment,
  ): Promise<spl.Account | null> => {
    try {
      return await spl.getAccount(this.connection, account, commitment, programId);
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
}

const _getCashAccount = async (
  connection: Connection,
  cashLinkAddress: PublicKey,
  commitment?: Commitment,
): Promise<Cash | null> => {
  try {
    const accountInfo = await connection.getAccountInfo(cashLinkAddress, commitment);
    if (accountInfo === null) {
      return null;
    }
    const cash = Cash.from(new Account(cashLinkAddress, accountInfo));
    return cash;
  } catch (error) {
    return null;
  }
};
