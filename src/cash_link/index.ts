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
import { CashLink, CashLinkDistributionType, CashLinkState } from '../accounts/cash_link';
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
import { Redemption } from '../accounts/redemption';

export const FAILED_TO_FIND_ACCOUNT = 'Failed to find account';
export const INVALID_ACCOUNT_OWNER = 'Invalid account owner';
export const INVALID_AUTHORITY = 'Invalid authority';
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
    const transaction = new Transaction();
    transaction.add(...instructions);
    transaction.recentBlockhash = value.blockhash;
    transaction.lastValidBlockHeight = value.lastValidBlockHeight;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority, ...signers);
    return {
      transaction: transaction.serialize().toString('base64'),
      slot: context.slot,
    };
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
        authority: this.authority.publicKey,
        destinationWallet: this.feePayer.publicKey,
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
    const transaction = new Transaction();
    transaction.add(...instructions);
    transaction.recentBlockhash = value.blockhash;
    transaction.lastValidBlockHeight = value.lastValidBlockHeight;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority, ...signers);
    return {
      transaction: transaction.serialize().toString('base64'),
      slot: context.slot,
    };
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
    let ownerTokenKeyPair: Keypair | undefined;
    let ownerTokenAccount: PublicKey | undefined;
    if (mint.equals(spl.NATIVE_MINT)) {
      ownerTokenKeyPair = Keypair.generate();
      ownerTokenAccount = ownerTokenKeyPair.publicKey;
    } else {
      ownerTokenAccount = spl.getAssociatedTokenAddressSync(mint, owner, true);
    }
    const instructions = [];
    if (ownerTokenKeyPair) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: this.feePayer.publicKey,
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
        spl.createInitializeAccount3Instruction(
          ownerTokenAccount,
          spl.NATIVE_MINT,
          owner,
          spl.TOKEN_PROGRAM_ID,
        ),
      );
    }
    const cancelInstruction = await this.cancelInstruction({
      owner,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      ownerToken: spl.getAssociatedTokenAddressSync(mint, owner, true),
      ownerTokenIsSigner: !!ownerTokenKeyPair,
      vaultToken: spl.getAssociatedTokenAddressSync(mint, cashLink.pubkey, true),
      feePayer: this.feePayer.publicKey,
      passKey: new PublicKey(input.passKey),
      cashLinkBump,
    });
    instructions.push(cancelInstruction);
    if (ownerTokenKeyPair) {
      instructions.push(...this.unWrapSol(owner, ownerTokenAccount));
    }
    return {
      instructions,
      signers: ownerTokenKeyPair ? [ownerTokenKeyPair] : undefined,
    };
  };

  cancelInstruction = async (params: CancelCashLinkParams): Promise<TransactionInstruction> => {
    const keys = [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.cashLink, isSigner: false, isWritable: true },
      { pubkey: params.passKey, isSigner: false, isWritable: false },
      { pubkey: params.owner, isSigner: false, isWritable: false },
      { pubkey: params.ownerToken, isSigner: params.ownerTokenIsSigner, isWritable: true },
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
    const closeInstruction = this.closeInstruction({
      cashLink: cashLinkAddress,
      authority: this.authority.publicKey,
      destinationWallet: this.feePayer.publicKey,
    });
    const transaction = new Transaction().add(closeInstruction);
    if (input.computeBudget) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    transaction.recentBlockhash = value.blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    return {
      transaction: transaction.serialize().toString('base64'),
      slot: context.slot,
    };
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
    const transaction = new Transaction();
    transaction.add(...instructions);
    transaction.recentBlockhash = value.blockhash;
    transaction.lastValidBlockHeight = value.lastValidBlockHeight;
    transaction.feePayer = this.feePayer.publicKey;
    if (input.computeBudget) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    transaction.partialSign(this.feePayer, this.authority, ...signers);
    return {
      transaction: transaction
        .serialize({
          requireAllSignatures: false,
        })
        .toString('base64'),
      slot: context.slot,
    };
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
    const totalRedemptionFee = rentFeeToRedeem
      .add(baseFeeToRedeem)
      .mul(new BN(input.maxNumRedemptions));
    const totalAmount =
      input.distributionType === CashLinkDistributionType.Fixed
        ? amount.mul(new BN(input.maxNumRedemptions)).add(totalRedemptionFee)
        : amount.add(totalRedemptionFee);
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
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
      distributionType: input.distributionType,
      fingerprintEnabled: input.fingerprintEnabled,
      numDaysToExpire: input.numDaysToExpire ?? 1,
    };
    const instructions = [];
    if (ownerTokenKeyPair) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: this.feePayer.publicKey,
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
    if (ownerTokenKeyPair) {
      instructions.push(...this.unWrapSol(owner, ownerTokenAccount));
    }
    return {
      instructions,
      signers: ownerTokenKeyPair ? [ownerTokenKeyPair] : undefined,
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

    const transaction = new Transaction();
    transaction.add(...instructions);
    transaction.recentBlockhash = value.blockhash;
    transaction.lastValidBlockHeight = value.lastValidBlockHeight;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer, this.authority, ...signers);
    return {
      transaction: transaction
        .serialize({
          requireAllSignatures: false,
        })
        .toString('base64'),
      slot: context.slot,
    };
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
    if (cashLink.data.fingerprintEnabled) {
      if (!fingerprint) {
        throw new Error(FINGERPRINT_NOT_FOUND);
      }
      [fingerprintPda, fingerprintBump] = await CashProgram.findFingerprintAccount(
        cashLinkAddress,
        input.fingerprint,
      );
    }
    const walletAddress = new PublicKey(input.walletAddress);
    const owner = new PublicKey(cashLink.data.owner);
    let accountKeys = [walletAddress, this.feeWallet, owner, this.feePayer.publicKey];
    const mint = new PublicKey(cashLink.data.mint);
    const vaultToken = spl.getAssociatedTokenAddressSync(mint, cashLinkAddress, true);
    let walletTokenKeyPair: Keypair | undefined;
    let walletTokenAccount: PublicKey | undefined;
    let ownerTokenKeyPair: Keypair | undefined;
    let ownerTokenAccount: PublicKey | undefined;
    if (mint.equals(spl.NATIVE_MINT)) {
      walletTokenKeyPair = Keypair.generate();
      walletTokenAccount = walletTokenKeyPair.publicKey;
      ownerTokenKeyPair = Keypair.generate();
      ownerTokenAccount = ownerTokenKeyPair.publicKey;
    } else {
      walletTokenAccount = spl.getAssociatedTokenAddressSync(mint, walletAddress, true);
      ownerTokenAccount = (
        await spl.getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          mint,
          accountKeys[2],
          true,
          input.commitment,
        )
      ).address;
    }
    accountKeys = await Promise.all([
      walletTokenAccount,
      spl
        .getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          mint,
          accountKeys[1],
          true,
          input.commitment,
        )
        .then((acc) => acc.address),
      ownerTokenAccount,
      spl
        .getOrCreateAssociatedTokenAccount(
          this.connection,
          this.feePayer,
          mint,
          accountKeys[3],
          true,
          input.commitment,
        )
        .then((acc) => acc.address),
    ]);
    const [redemption, redemptionBump] = await CashProgram.findRedemptionAccount(
      cashLinkAddress,
      walletAddress,
    );
    const redeemInstruction = await this.redeemInstruction({
      mint,
      redemption,
      cashLinkBump,
      passKey,
      redemptionBump: redemptionBump,
      wallet: walletAddress,
      walletToken: accountKeys[0],
      walletTokenIsSigner: !!walletTokenKeyPair,
      platformFeeToken: accountKeys[1],
      ownerToken: accountKeys[2],
      ownerTokenIsSigner: !!ownerTokenKeyPair,
      feePayerToken: accountKeys[3],
      vaultToken,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      feePayer: this.feePayer.publicKey,
      fingerprint,
      fingerprintBump,
      fingerprintPda,
    });
    const instructions = [];
    if (walletTokenKeyPair) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: this.feePayer.publicKey,
          toPubkey: walletTokenAccount,
          lamports: kTokenProgramRent,
        }),
        SystemProgram.allocate({
          accountPubkey: walletTokenAccount,
          space: spl.AccountLayout.span,
        }),
        SystemProgram.assign({
          accountPubkey: walletTokenAccount,
          programId: spl.TOKEN_PROGRAM_ID,
        }),
        spl.createInitializeAccount3Instruction(
          walletTokenAccount,
          spl.NATIVE_MINT,
          walletAddress,
          spl.TOKEN_PROGRAM_ID,
        ),
      );
    }
    if (ownerTokenKeyPair) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: this.feePayer.publicKey,
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
        spl.createInitializeAccount3Instruction(
          ownerTokenAccount,
          spl.NATIVE_MINT,
          owner,
          spl.TOKEN_PROGRAM_ID,
        ),
      );
    }
    instructions.push(redeemInstruction);
    const signers = [];
    if (walletTokenKeyPair) {
      instructions.push(...this.unWrapSol(walletAddress, walletTokenAccount));
      signers.push(walletTokenKeyPair);
    }
    if (ownerTokenKeyPair) {
      instructions.push(...this.unWrapSol(owner, ownerTokenAccount));
      signers.push(ownerTokenKeyPair);
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
      { pubkey: params.redemption, isSigner: false, isWritable: true },
      { pubkey: params.ownerToken, isSigner: params.ownerTokenIsSigner, isWritable: true },
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
        redemptionBump: params.redemptionBump,
        fingerprintBump: params.fingerprintBump,
        fingerprint: params.fingerprint,
      }),
    });
  };

  signTransaction = (transaction: Transaction): Buffer => {
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer);
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
      spl.createCloseAccountInstruction(wrapSolAccount, wallet, wallet, null, spl.TOKEN_PROGRAM_ID),
      SystemProgram.transfer({
        fromPubkey: wallet,
        toPubkey: this.feePayer.publicKey,
        lamports: kTokenProgramRent,
      }),
    ];
    return instructions;
  };

  getCashLinkRedemption = async (
    address: PublicKey,
    commitment?: Commitment,
  ): Promise<Redemption | null> => {
    try {
      return await _getCashLinkRedemptionAccount(this.connection, address, commitment);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
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

const _getCashLinkRedemptionAccount = async (
  connection: Connection,
  redemptionAddress: PublicKey,
  commitment?: Commitment,
): Promise<Redemption | null> => {
  try {
    const accountInfo = await connection.getAccountInfo(redemptionAddress, commitment);
    if (accountInfo === null) {
      return null;
    }
    const redemption = Redemption.from(new Account(redemptionAddress, accountInfo));
    return redemption;
  } catch (error) {
    return null;
  }
};
