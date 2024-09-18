import {
  EthereumTransactionTypeExtended,
  gasLimitRecommendations,
  ProtocolAction,
} from '@aave/contract-helpers';
import { SignatureLike } from '@ethersproject/bytes';
import { TransactionResponse } from '@ethersproject/providers';
import { useQueryClient } from '@tanstack/react-query';
import { DependencyList, useEffect, useRef, useState } from 'react';
import { useAppDataContext } from 'src/hooks/app-data-provider/useAppDataProvider';
import { useModalContext } from 'src/hooks/useModal';
import { useTonTransactions } from 'src/hooks/useTonTransactions';
import { useTonConnectContext } from 'src/libs/hooks/useTonConnectContext';
import { useWeb3Context } from 'src/libs/hooks/useWeb3Context';
import { useRootStore } from 'src/store/root';
import { TransactionDetails } from 'src/store/transactionsSlice';
import { ApprovalMethod } from 'src/store/walletSlice';
import { getErrorTextFromError, TxAction } from 'src/ui-config/errorMapping';
import { queryKeysFactory } from 'src/ui-config/queries';

export const MOCK_SIGNED_HASH = 'Signed correctly';

interface UseTransactionHandlerProps {
  handleGetTxns: () => Promise<EthereumTransactionTypeExtended[]>;
  handleGetPermitTxns?: (
    signatures: SignatureLike[],
    deadline: string
  ) => Promise<EthereumTransactionTypeExtended[]>;
  tryPermit?: boolean;
  permitAction?: ProtocolAction;
  skip?: boolean;
  protocolAction?: ProtocolAction;
  deps?: DependencyList;
  eventTxInfo?: TransactionDetails;
  underlyingAssetTon?: string | number;
  usageAsCollateral?: boolean;
  poolJettonWalletAddress?: string;
  typeAction?: 'isWithdraw' | 'isCollateral';
  decimals?: number;
}

export type Approval = {
  amount: string;
  underlyingAsset: string;
  permitType?: 'POOL' | 'SUPPLY_MIGRATOR_V3' | 'BORROW_MIGRATOR_V3' | 'STAKE';
};

export const useTransactionHandler = ({
  handleGetTxns,
  handleGetPermitTxns,
  tryPermit = false,
  permitAction,
  skip,
  protocolAction,
  deps = [],
  eventTxInfo,
  underlyingAssetTon,
  usageAsCollateral,
  poolJettonWalletAddress,
  typeAction,
  decimals,
}: UseTransactionHandlerProps) => {
  const {
    approvalTxState,
    setApprovalTxState,
    mainTxState,
    setMainTxState,
    setGasLimit,
    loadingTxns,
    setLoadingTxns,
    setTxError,
  } = useModalContext();
  const { signTxData, sendTx, getTxError } = useWeb3Context();
  const [signatures, setSignatures] = useState<SignatureLike[]>([]);
  const [signatureDeadline, setSignatureDeadline] = useState<string>();
  const queryClient = useQueryClient();

  const [
    signPoolERC20Approval,
    walletApprovalMethodPreference,
    generateCreditDelegationSignatureRequest,
    generatePermitPayloadForMigrationSupplyAsset,
    addTransaction,
    signStakingApproval,
    currentMarketData,
  ] = useRootStore((state) => [
    state.signERC20Approval,
    state.walletApprovalMethodPreference,
    state.generateCreditDelegationSignatureRequest,
    state.generatePermitPayloadForMigrationSupplyAsset,
    state.addTransaction,
    state.signStakingApproval,
    state.currentMarketData,
  ]);

  const [approvalTxes, setApprovalTxes] = useState<EthereumTransactionTypeExtended[] | undefined>();
  const [actionTx, setActionTx] = useState<EthereumTransactionTypeExtended | undefined>();
  const [usePermit, setUsePermit] = useState(false);
  const mounted = useRef(false);
  const { isConnectedTonWallet, walletAddressTonWallet } = useTonConnectContext();
  const { onToggleCollateralTon, onSendWithdrawTon } = useTonTransactions(
    walletAddressTonWallet,
    String(underlyingAssetTon)
  );
  const { getYourSupplies, getPoolContractGetReservesData } = useAppDataContext();

  useEffect(() => {
    mounted.current = true; // Will set it to true on mount ...
    return () => {
      mounted.current = false;
    }; // ... and to false on unmount
  }, []);
  /**
   * Executes the transactions and handles loading & error states.
   * @param fn
   * @returns
   */
  // eslint-disable-next-line
  const processTx = async ({
    tx,
    errorCallback,
    successCallback,
    approval,
  }: {
    tx: () => Promise<TransactionResponse>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorCallback?: (error: any, hash?: string) => void;
    successCallback?: (param: TransactionResponse) => void;
    approval?: boolean;
  }) => {
    try {
      const txnResult = await tx();

      try {
        await txnResult.wait(1);

        mounted.current && successCallback && successCallback(txnResult);

        addTransaction(txnResult.hash, {
          txState: 'success',
          action: approval ? ProtocolAction.approval : protocolAction ?? ProtocolAction.default,
          ...eventTxInfo,
        });

        queryClient.invalidateQueries({ queryKey: queryKeysFactory.pool });
        queryClient.invalidateQueries({ queryKey: queryKeysFactory.gho });
        queryClient.invalidateQueries({ queryKey: queryKeysFactory.staking });
      } catch (e) {
        // TODO: what to do with this error?
        try {
          // TODO: what to do with this error?
          const error = await getTxError(txnResult.hash);
          mounted.current && errorCallback && errorCallback(new Error(error), txnResult.hash);
          return;
        } catch (e) {
          mounted.current && errorCallback && errorCallback(e, txnResult.hash);
          return;
        } finally {
          addTransaction(txnResult.hash, {
            txState: 'failed',
            action: protocolAction || ProtocolAction.default,
            ...eventTxInfo,
          });
        }
      }

      return;
    } catch (e) {
      errorCallback && errorCallback(e);
    }
  };

  const approval = async (approvals?: Approval[]) => {
    if (approvalTxes) {
      if (usePermit && approvals && approvals?.length > 0) {
        setApprovalTxState({ ...approvalTxState, loading: true });
        try {
          // deadline is an hour after signature
          const deadline = Math.floor(Date.now() / 1000 + 3600).toString();
          const unsignedPromisePayloads: Promise<string>[] = [];
          for (const approval of approvals) {
            if (!approval.permitType || approval.permitType == 'POOL') {
              unsignedPromisePayloads.push(
                signPoolERC20Approval({
                  reserve: approval.underlyingAsset,
                  amount: approval.amount,
                  deadline,
                })
              );
            } else if (approval.permitType === 'SUPPLY_MIGRATOR_V3') {
              unsignedPromisePayloads.push(
                generatePermitPayloadForMigrationSupplyAsset({ ...approval, deadline })
              );
            } else if (approval.permitType === 'BORROW_MIGRATOR_V3') {
              unsignedPromisePayloads.push(
                generateCreditDelegationSignatureRequest({
                  ...approval,
                  deadline,
                  spender: currentMarketData.addresses.V3_MIGRATOR || '',
                })
              );
            } else if (approval.permitType === 'STAKE') {
              unsignedPromisePayloads.push(
                signStakingApproval({
                  token: approval.underlyingAsset,
                  amount: approval.amount,
                  deadline,
                })
              );
            }
          }
          try {
            const signatures: SignatureLike[] = [];
            const unsignedPayloads = await Promise.all(unsignedPromisePayloads);
            for (const unsignedPayload of unsignedPayloads) {
              signatures.push(await signTxData(unsignedPayload));
            }
            if (!mounted.current) return;
            setSignatures(signatures);
            setSignatureDeadline(deadline);
            setApprovalTxState({
              txHash: MOCK_SIGNED_HASH,
              loading: false,
              success: true,
            });
            setTxError(undefined);
          } catch (error) {
            if (!mounted.current) return;
            const parsedError = getErrorTextFromError(error, TxAction.APPROVAL, false);
            setTxError(parsedError);
            setApprovalTxState({
              txHash: undefined,
              loading: false,
            });
          }
        } catch (error) {
          if (!mounted.current) return;

          const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
          setTxError(parsedError);
          setApprovalTxState({
            txHash: undefined,
            loading: false,
          });
        }
      } else {
        try {
          setApprovalTxState({ ...approvalTxState, loading: true });
          const params = await Promise.all(approvalTxes.map((approvalTx) => approvalTx.tx()));
          const approvalResponses = await Promise.all(
            params.map(
              (param) =>
                new Promise<TransactionResponse>(async (resolve, reject) => {
                  delete param.gasPrice;
                  processTx({
                    tx: () => sendTx(param),
                    successCallback: (txnResponse: TransactionResponse) => {
                      resolve(txnResponse);
                    },
                    errorCallback: (error, hash) => {
                      const parsedError = getErrorTextFromError(error, TxAction.APPROVAL, false);
                      setTxError(parsedError);
                      setApprovalTxState({
                        txHash: hash,
                        loading: false,
                      });
                      reject();
                    },
                    approval: true,
                  });
                })
            )
          );

          setApprovalTxState({
            txHash: approvalResponses[0].hash,
            loading: false,
            success: true,
          });
        } catch (error) {
          if (!mounted.current) return;
          const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
          setTxError(parsedError);
          setApprovalTxState({
            txHash: undefined,
            loading: false,
          });
        }
      }
    }
  };

  const action = async () => {
    if (isConnectedTonWallet) {
      setMainTxState({ ...mainTxState, loading: true });
      if (typeAction === 'isWithdraw') {
        try {
          const res = await onSendWithdrawTon(
            String(poolJettonWalletAddress),
            decimals,
            `${eventTxInfo?.amount}`
          );
          await Promise.allSettled([getPoolContractGetReservesData(true), getYourSupplies()]);

          if (!res.success) {
            const error = {
              name: 'Error Withdraw Ton',
              message: `${res?.message}`,
              error: res.error,
            };
            const parsedError = getErrorTextFromError(
              error,
              TxAction.GAS_ESTIMATION,
              res?.blocking
            );
            setTxError(parsedError);
            setMainTxState({
              txHash: undefined,
              loading: false,
            });
          } else if (res.success) {
            setMainTxState({
              txHash: res.txHash,
              loading: false,
              success: res.success,
              amount: eventTxInfo?.rootAmount,
            });
          }
        } catch (error) {
          console.log('error Withdraw--------------', error);
        }
      } else if ((typeAction = 'isCollateral')) {
        const resToggle = await onToggleCollateralTon(
          String(poolJettonWalletAddress),
          Boolean(usageAsCollateral)
        );

        await Promise.allSettled([getPoolContractGetReservesData(true), getYourSupplies()]);
        if (resToggle && !resToggle.success) {
          const error = {
            name: 'Error change collateral Ton',
            message: `${resToggle?.message}`,
          };
          const parsedError = getErrorTextFromError(
            error,
            TxAction.GAS_ESTIMATION,
            resToggle?.blocking
          );
          setTxError(parsedError);
          setMainTxState({
            txHash: undefined,
            loading: false,
          });
        } else if (resToggle && resToggle.success) {
          setMainTxState({
            txHash: resToggle.txHash,
            loading: false,
            success: resToggle.success,
          });
        }
      } else {
        console.log(typeAction);
      }
    }
    if (usePermit && handleGetPermitTxns) {
      if (!signatures.length || !signatureDeadline) throw new Error('signature needed');
      try {
        setMainTxState({ ...mainTxState, loading: true });
        const txns = await handleGetPermitTxns(signatures, signatureDeadline);
        const params = await txns[0].tx();
        delete params.gasPrice;
        return processTx({
          tx: () => sendTx(params),
          successCallback: (txnResponse: TransactionResponse) => {
            setMainTxState({
              txHash: txnResponse.hash,
              loading: false,
              success: true,
            });
            setTxError(undefined);
          },
          errorCallback: (error, hash) => {
            const parsedError = getErrorTextFromError(error, TxAction.MAIN_ACTION);
            setTxError(parsedError);
            setMainTxState({
              txHash: hash,
              loading: false,
            });
          },
        });
      } catch (error) {
        console.log(error, 'error');
        const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
        setTxError(parsedError);
        setMainTxState({
          txHash: undefined,
          loading: false,
        });
      }
    }
    if ((!usePermit || !approvalTxes) && actionTx) {
      try {
        setMainTxState({ ...mainTxState, loading: true });
        const params = await actionTx.tx();
        delete params.gasPrice;
        return processTx({
          tx: () => sendTx(params),
          successCallback: (txnResponse: TransactionResponse) => {
            setMainTxState({
              txHash: txnResponse.hash,
              loading: false,
              success: true,
            });
            setTxError(undefined);
          },
          errorCallback: (error, hash) => {
            const parsedError = getErrorTextFromError(error, TxAction.MAIN_ACTION);
            setTxError(parsedError);
            setMainTxState({
              txHash: hash,
              loading: false,
            });
          },
        });
      } catch (error) {
        const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
        console.log(error, parsedError);
        setTxError(parsedError);
        setMainTxState({
          txHash: undefined,
          loading: false,
        });
      }
    }
  };

  // populate txns
  // fetches standard txs (optional approval + action), then based off availability and user preference, set tx flow and gas estimation to permit or approve
  useEffect(() => {
    if (!skip) {
      setLoadingTxns(true);
      const timeout = setTimeout(() => {
        setLoadingTxns(true);
        return handleGetTxns()
          .then(async (txs) => {
            if (!mounted.current) return;
            const approvalTransactions = txs.filter((tx) => tx.txType == 'ERC20_APPROVAL');
            if (approvalTransactions.length > 0) {
              setApprovalTxes(approvalTransactions);
            }
            const preferPermit =
              tryPermit &&
              walletApprovalMethodPreference === ApprovalMethod.PERMIT &&
              handleGetPermitTxns &&
              permitAction;
            if (approvalTransactions.length > 0 && preferPermit) {
              // For permit flow, just use recommendation for gas limit as estimation will always fail without signature and tx must be rebuilt with signature anyways
              setUsePermit(true);
              const gas = gasLimitRecommendations[permitAction];
              setGasLimit(gas.limit || '');
              setMainTxState({
                txHash: undefined,
              });
              setTxError(undefined);
              setLoadingTxns(false);
            } else {
              setUsePermit(false);
              // For approval flow, set approval/action status and gas limit accordingly
              if (approvalTransactions.length > 0) {
                setApprovalTxes(approvalTransactions);
              }
              setActionTx(
                txs.find((tx) =>
                  [
                    'DLP_ACTION',
                    'REWARD_ACTION',
                    'FAUCET_V2_MINT',
                    'FAUCET_MINT',
                    'STAKE_ACTION',
                    'GOV_DELEGATION_ACTION',
                    'GOVERNANCE_ACTION',
                    'V3_MIGRATION_ACTION',
                  ].includes(tx.txType)
                )
              );
              setMainTxState({
                txHash: undefined,
              });
              setTxError(undefined);
              let gasLimit = 0;
              try {
                for (const tx of txs) {
                  const txGas = await tx.gas();
                  // If permit is available, use regular action for estimation but exclude the approval tx
                  if (txGas && txGas.gasLimit) {
                    gasLimit = gasLimit + Number(txGas.gasLimit);
                  }
                }
              } catch (error) {
                if (!mounted.current) return;
                const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
                setTxError(parsedError);
              }
              setGasLimit(gasLimit.toString() || '');
              setLoadingTxns(false);
            }
          })
          .catch((error) => {
            if (!mounted.current) return;
            setMainTxState({
              txHash: undefined,
            });
            const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
            setTxError(parsedError);
            setLoadingTxns(false);
          });
      }, 1000);
      return () => clearTimeout(timeout);
    } else {
      setApprovalTxes(undefined);
      setActionTx(undefined);
    }
  }, [skip, ...deps, tryPermit, walletApprovalMethodPreference]);

  return {
    approval,
    action,
    loadingTxns,
    setUsePermit,
    requiresApproval: !!approvalTxes || usePermit,
    approvalTxState,
    mainTxState,
    usePermit,
  };
};
