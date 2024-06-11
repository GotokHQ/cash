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
import {
  InitializeCashLinkInput,
  ResultContext,
  CashLinkInput,
  RedeemCashLinkInput,
} from './types';
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
export const INVALID_AUTHORITY = 'Invalid _authority';
export const INVALID_PAYER_ADDRESS = 'Invalid payer address';
export const ACCOUNT_ALREADY_EXPIRED = 'Account already canceled';
export const ACCOUNT_ALREADY_SETTLED = 'Account already settled';
export const ACCOUNT_NOT_INITIALIZED_OR_SETTLED = 'Account not initialized or settled';
export const ACCOUNT_NOT_EXPIRED = 'Account not canceled';
export const ACCOUNT_HAS_REDEMPTIONS = 'Account has redemptions';
export const INVALID_SIGNATURE = 'Invalid signature';
export const AMOUNT_MISMATCH = 'Amount mismatch';
export const INVALID_STATE = 'Invalid state';
export const FEE_MISMATCH = 'Fee mismatch';
export const TRANSACTION_SEND_ERROR = 'Transaction send error';
export const FINGERPRINT_NOT_FOUND = 'Fingerprint required';

export const kTokenProgramRent = 2039280;

export class CashLinkClient {
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

  cancel = async (input: CashLinkInput): Promise<ResultContext> => {
    const [cashLinkAddress, bump] = await CashProgram.findCashLinkAccount(
      new PublicKey(input.passKey),
    );
    const cashLink = await _getCashLinkAccount(this.connection, cashLinkAddress);
    if (cashLink == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const { instructions, signers } = await this.cancelTransaction(cashLink, bump, input);
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

  cancelAndClose = async (input: CashLinkInput): Promise<ResultContext> => {
    const [cashLinkAddress, bump] = await CashProgram.findCashLinkAccount(
      new PublicKey(input.passKey),
    );
    const cashLink = await _getCashLinkAccount(this.connection, cashLinkAddress);
    if (cashLink == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const { instructions, signers } = await this.cancelTransaction(cashLink, bump, input);
    if (cashLink.data.totalRedemptions === 0) {
      const closeInstruction = this.closeInstruction({
        cashLink: cashLinkAddress,
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
    cashLink: CashLink,
    cashLinkBump: number,
    input: CashLinkInput,
  ): Promise<{
    instructions: TransactionInstruction[];
    signers: Keypair[];
  }> => {
    if (cashLink.data?.state === CashLinkState.Expired) {
      throw new Error(ACCOUNT_ALREADY_EXPIRED);
    }
    if (cashLink.data?.state === CashLinkState.Redeemed) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const owner = new PublicKey(cashLink.data.owner);
    const mint = new PublicKey(cashLink.data.mint);
    let ownerTokenAccount: PublicKey | undefined;
    if (mint.equals(spl.NATIVE_MINT)) {
      ownerTokenAccount = owner;
    } else {
      ownerTokenAccount = spl.getAssociatedTokenAddressSync(mint, owner, true);
    }
    const instructions = [];
    const cancelInstruction = await this.cancelInstruction({
      authority: this.authority,
      cashLink: cashLink.pubkey,
      ownerToken: ownerTokenAccount,
      vaultToken: spl.getAssociatedTokenAddressSync(mint, cashLink.pubkey, true),
      feePayer: this.feePayer,
      passKey: new PublicKey(input.passKey),
      cashLinkBump,
    });
    instructions.push(cancelInstruction);
    return {
      instructions,
      signers: [],
    };
  };

  cancelInstruction = async (params: CancelCashLinkParams): Promise<TransactionInstruction> => {
    const keys = [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.cashLink, isSigner: false, isWritable: true },
      { pubkey: params.passKey, isSigner: false, isWritable: false },
      { pubkey: params.ownerToken, isSigner: false, isWritable: true },
      { pubkey: params.feePayer, isSigner: false, isWritable: true },
      {
        pubkey: params.vaultToken,
        isSigner: false,
        isWritable: true,
      },
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
    ];
    return new TransactionInstruction({
      keys,
      programId: CashProgram.PUBKEY,
      data: CancelCashLinkArgs.serialize({
        cashLinkBump: params.cashLinkBump,
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
      SYSVAR_CLOCK_PUBKEY,
      ComputeBudgetProgram.programId,
      CashProgram.PUBKEY,
      SYSVAR_RENT_PUBKEY,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      SYSVAR_SLOT_HASHES_PUBKEY,
    ];
  };

  close = async (input: CashLinkInput): Promise<ResultContext> => {
    const [cashLinkAddress] = await CashProgram.findCashLinkAccount(new PublicKey(input.passKey));
    const cashLink = await _getCashLinkAccount(this.connection, cashLinkAddress);
    if (cashLink == null || !cashLink.data) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    if (cashLink.data.state !== CashLinkState.Expired) {
      throw new Error(ACCOUNT_NOT_EXPIRED);
    }
    if (cashLink.data.totalRedemptions !== 0) {
      throw new Error(ACCOUNT_HAS_REDEMPTIONS);
    }
    const instructions = [
      this.closeInstruction({
        cashLink: cashLinkAddress,
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
        { pubkey: params.destinationWallet, isSigner: false, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  initialize = async (input: InitializeCashLinkInput): Promise<ResultContext> => {
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
    input: InitializeCashLinkInput,
  ): Promise<{
    instructions: TransactionInstruction[];
    signers: Keypair[];
  }> => {
    const owner = new PublicKey(input.wallet);
    const mint: PublicKey = new PublicKey(input.mint);
    const passKey = new PublicKey(input.passKey);
    const [cashLink, cashLinkBump] = await CashProgram.findCashLinkAccount(passKey);
    const amount = new BN(input.amount);
    const networkFee = new BN(input.networkFee ?? 0);
    const rentFeeToRedeem = new BN(input.rentFeeToRedeem ?? 0);
    const baseFeeToRedeem = new BN(input.baseFeeToRedeem ?? 0);
    const totalAmount = new BN(input.totalAmount);
    const feeBps = input.feeBps ?? 0;
    const maxNumRedemptions = input.maxNumRedemptions;
    const minAmount = input.minAmount ? new BN(input.minAmount) : undefined;
    let ownerTokenKeyPair: Keypair | undefined;
    let ownerTokenAccount: PublicKey | undefined;
    if (mint.equals(spl.NATIVE_MINT)) {
      ownerTokenKeyPair = Keypair.generate();
      ownerTokenAccount = ownerTokenKeyPair.publicKey;
    } else {
      ownerTokenAccount = spl.getAssociatedTokenAddressSync(mint, owner, true);
    }
    const initParams: InitCashLinkParams = {
      mint,
      owner,
      cashLinkBump,
      cashLink,
      feeBps,
      networkFee,
      rentFeeToRedeem,
      baseFeeToRedeem,
      maxNumRedemptions,
      ownerTokenAccount,
      ownerTokenAccountIsSigner: !!ownerTokenKeyPair,
      minAmount,
      passKey,
      amount: amount,
      authority: this.authority,
      feePayer: this.feePayer,
      distributionType: input.distributionType,
      fingerprintEnabled: input.fingerprintEnabled,
      numDaysToExpire: input.numDaysToExpire ?? 1,
    };
    const instructions = [];
    if (ownerTokenKeyPair) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: this.feePayer,
          toPubkey: ownerTokenAccount,
          lamports: kTokenProgramRent,
        }),
        SystemProgram.allocate({
          accountPubkey: ownerTokenAccount,
          space: spl.AccountLayout.span,
        }),
        SystemProgram.assign({
          accountPubkey: ownerTokenAccount,
          programId: spl.TOKEN_PROGRAM_ID,
        }),
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: ownerTokenAccount,
          lamports: totalAmount.toNumber(),
        }),
        spl.createInitializeAccount3Instruction(
          ownerTokenAccount,
          spl.NATIVE_MINT,
          owner,
          spl.TOKEN_PROGRAM_ID,
        ),
      );
    }
    instructions.push(await this.initInstruction(initParams));
    const signers = [];
    if (ownerTokenKeyPair) {
      instructions.push(...this.unWrapSol(owner, ownerTokenAccount));
      signers.push(ownerTokenKeyPair);
    }
    return {
      instructions,
      signers,
    };
  };

  initInstruction = async (params: InitCashLinkParams): Promise<TransactionInstruction> => {
    const {
      amount,
      feeBps,
      networkFee,
      rentFeeToRedeem,
      baseFeeToRedeem,
      passKey,
      distributionType,
      owner,
      cashLinkBump,
      authority,
      cashLink,
      mint,
      maxNumRedemptions,
      minAmount,
      fingerprintEnabled,
      numDaysToExpire,
      ownerTokenAccount,
      ownerTokenAccountIsSigner,
    } = params;
    const data = InitCashLinkArgs.serialize({
      amount,
      feeBps,
      networkFee,
      rentFeeToRedeem,
      baseFeeToRedeem,
      cashLinkBump,
      distributionType,
      maxNumRedemptions,
      minAmount,
      fingerprintEnabled,
      numDaysToExpire,
    });
    const keys = [
      {
        pubkey: authority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: owner,
        isSigner: true,
        isWritable: !mint,
      },
      {
        pubkey: this.feePayer,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: cashLink,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: passKey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: spl.getAssociatedTokenAddressSync(mint, cashLink, true),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: ownerTokenAccount,
        isSigner: ownerTokenAccountIsSigner,
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

  redeem = async (input: RedeemCashLinkInput): Promise<ResultContext> => {
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
    input: RedeemCashLinkInput,
  ): Promise<{
    instructions: TransactionInstruction[];
    signers: Keypair[];
  }> => {
    const passKey = new PublicKey(input.passKey);
    const [cashLinkAddress, cashLinkBump] = await CashProgram.findCashLinkAccount(passKey);
    const cashLink = await _getCashLinkAccount(this.connection, cashLinkAddress, input.commitment);
    if (cashLink == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const fingerprint = input.fingerprint;
    let fingerprintPda: PublicKey | undefined;
    let fingerprintBump: number | undefined;
    if (cashLink.data.fingerprintEnabled && !fingerprint) {
      throw new Error(FINGERPRINT_NOT_FOUND);
    }
    if (fingerprint) {
      [fingerprintPda, fingerprintBump] = await CashProgram.findFingerprintAccount(
        cashLinkAddress,
        input.fingerprint,
      );
    }
    const walletAddress = new PublicKey(input.walletAddress);
    const owner = new PublicKey(cashLink.data.owner);
    let accountKeys = [walletAddress, this.feeWallet, owner, this.feePayer];
    const mint = new PublicKey(cashLink.data.mint);
    const vaultToken = spl.getAssociatedTokenAddressSync(mint, cashLinkAddress, true);
    let walletTokenKeyPair: Keypair | undefined;
    let walletTokenAccount: PublicKey | undefined;
    let ownerTokenAccount: PublicKey | undefined;
    if (mint.equals(spl.NATIVE_MINT)) {
      walletTokenKeyPair = Keypair.generate();
      walletTokenAccount = walletTokenKeyPair.publicKey;
      ownerTokenAccount = owner;
    } else {
      walletTokenAccount = spl.getAssociatedTokenAddressSync(mint, walletAddress, true);
      ownerTokenAccount = await this.getOrCreateAssociatedAccount(
        mint,
        accountKeys[2],
        input.commitment,
      );
    }
    accountKeys = await Promise.all([
      walletTokenAccount,
      await this.getOrCreateAssociatedAccount(mint, accountKeys[1], input.commitment),
      ownerTokenAccount,
      await this.getOrCreateAssociatedAccount(mint, accountKeys[3], input.commitment),
    ]);
    const walletTokenIsSigner = !!walletTokenKeyPair;
    const redeemInstruction = await this.redeemInstruction({
      mint,
      cashLinkBump,
      passKey,
      walletTokenIsSigner,
      wallet: walletAddress,
      walletToken: accountKeys[0],
      platformFeeToken: accountKeys[1],
      ownerToken: accountKeys[2],
      feePayerToken: accountKeys[3],
      vaultToken,
      authority: this.authority,
      cashLink: cashLink.pubkey,
      feePayer: this.feePayer,
      fingerprint,
      fingerprintBump,
      fingerprintPda,
    });
    const instructions = [];
    instructions.push(redeemInstruction);
    const signers = [];
    if (walletTokenIsSigner) {
      signers.push(walletTokenKeyPair);
    }
    return {
      instructions,
      signers,
    };
  };

  redeemInstruction = async (params: RedeemCashLinkParams): Promise<TransactionInstruction> => {
    const keys = [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.wallet, isSigner: false, isWritable: true },
      { pubkey: params.platformFeeToken, isSigner: false, isWritable: true },
      { pubkey: params.cashLink, isSigner: false, isWritable: true },
      { pubkey: params.passKey, isSigner: true, isWritable: false },
      { pubkey: params.ownerToken, isSigner: false, isWritable: true },
      { pubkey: params.feePayer, isSigner: true, isWritable: true },
      { pubkey: params.feePayerToken, isSigner: false, isWritable: true },
      {
        pubkey: params.vaultToken,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: params.walletToken, isSigner: params.walletTokenIsSigner, isWritable: true },
      {
        pubkey: params.mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_SLOT_HASHES_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ];
    if (params.fingerprintPda) {
      keys.push({
        pubkey: params.fingerprintPda,
        isSigner: false,
        isWritable: true,
      });
    }
    keys.push({
      pubkey: spl.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    });
    keys.push({
      pubkey: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    });
    return new TransactionInstruction({
      keys,
      programId: CashProgram.PUBKEY,
      data: RedeemCashLinkArgs.serialize({
        cashLinkBump: params.cashLinkBump,
        fingerprintBump: params.fingerprintBump,
        fingerprint: params.fingerprint,
      }),
    });
  };

  signTransaction = (transaction: Transaction): Buffer => {
    transaction.feePayer = this.feePayer;
    transaction.partialSign(this._feePayer);
    return transaction.serialize();
  };

  getVault = async (
    cashLink: PublicKey,
    mint: PublicKey,
    commitment?: Commitment,
  ): Promise<spl.Account | null> => {
    try {
      const vault = spl.getAssociatedTokenAddressSync(mint, cashLink, true);
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
      return await _getCashLinkAccount(this.connection, address, commitment);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
        return null;
      }
      throw error;
    }
  };

  unWrapSol = (wallet: PublicKey, wrapSolAccount: PublicKey) => {
    const instructions = [
      spl.createCloseAccountInstruction(wrapSolAccount, wallet, wallet),
      SystemProgram.transfer({
        fromPubkey: wallet,
        toPubkey: this.feePayer,
        lamports: kTokenProgramRent,
      }),
    ];
    return instructions;
  };

  getOrCreateAssociatedAccount = async (
    mint: PublicKey,
    owner: PublicKey,
    commitment?: Commitment,
  ): Promise<PublicKey> => {
    try {
      const associatedToken = spl.getAssociatedTokenAddressSync(mint, owner, true);
      const acc = await this._getAccount(associatedToken, commitment);
      if (acc === null) {
        const instruction = spl.createAssociatedTokenAccountInstruction(
          this.feePayer,
          associatedToken,
          owner,
          mint,
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
    commitment?: Commitment,
  ): Promise<spl.Account | null> => {
    try {
      return await spl.getAccount(this.connection, account, commitment);
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

const _getCashLinkAccount = async (
  connection: Connection,
  cashLinkAddress: PublicKey,
  commitment?: Commitment,
): Promise<CashLink | null> => {
  try {
    const accountInfo = await connection.getAccountInfo(cashLinkAddress, commitment);
    if (accountInfo === null) {
      return null;
    }
    const cashLink = CashLink.from(new Account(cashLinkAddress, accountInfo));
    return cashLink;
  } catch (error) {
    return null;
  }
};
