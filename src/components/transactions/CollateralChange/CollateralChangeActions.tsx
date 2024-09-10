import { ProtocolAction } from '@aave/contract-helpers';
import { Trans } from '@lingui/macro';
import { useTransactionHandler } from 'src/helpers/useTransactionHandler';
import { ComputedReserveData } from 'src/hooks/app-data-provider/useAppDataProvider';
import { useRootStore } from 'src/store/root';

import { TxActionsWrapper } from '../TxActionsWrapper';

export type CollateralChangeActionsProps = {
  poolReserve: ComputedReserveData;
  isWrongNetwork: boolean;
  usageAsCollateral: boolean;
  blocked: boolean;
  symbol: string;
  underlyingAssetTon?: string | number;
  poolJettonWalletAddress?: string;
};

export const CollateralChangeActions = ({
  poolReserve,
  isWrongNetwork,
  usageAsCollateral,
  blocked,
  symbol,
  underlyingAssetTon,
  poolJettonWalletAddress,
}: CollateralChangeActionsProps) => {
  const setUsageAsCollateral = useRootStore((state) => state.setUsageAsCollateral);

  const { action, loadingTxns, mainTxState, requiresApproval } = useTransactionHandler({
    underlyingAssetTon: underlyingAssetTon,
    poolJettonWalletAddress: poolJettonWalletAddress,
    decimals: poolReserve.decimals,
    typeAction: 'isCollateral',
    usageAsCollateral,
    tryPermit: false,
    protocolAction: ProtocolAction.setUsageAsCollateral,
    eventTxInfo: {
      assetName: poolReserve.name,
      asset: poolReserve.underlyingAsset,
      previousState: (!usageAsCollateral).toString(),
      newState: usageAsCollateral.toString(),
    },

    handleGetTxns: async () => {
      return setUsageAsCollateral({
        reserve: poolReserve.underlyingAsset,
        usageAsCollateral,
      });
    },
    skip: blocked,
  });

  return (
    <TxActionsWrapper
      requiresApproval={requiresApproval}
      blocked={blocked}
      preparingTransactions={loadingTxns}
      mainTxState={mainTxState}
      isWrongNetwork={isWrongNetwork}
      actionText={
        usageAsCollateral ? (
          <Trans>Enable {symbol} as collateral</Trans>
        ) : (
          <Trans>Disable {symbol} as collateral</Trans>
        )
      }
      actionInProgressText={<Trans>Pending...</Trans>}
      handleAction={action}
    />
  );
};
