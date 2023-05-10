import { DownloadIcon } from '@heroicons/react/outline';
import { ChevronDownIcon } from '@heroicons/react/solid';
import { Trans } from '@lingui/macro';
import {
  Box,
  CircularProgress,
  Menu,
  MenuItem,
  SvgIcon,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import React, { useCallback, useRef, useState } from 'react';
import { ConnectWalletPaper } from 'src/components/ConnectWalletPaper';
import { DarkTooltip } from 'src/components/infoTooltips/DarkTooltip';
import { ListWrapper } from 'src/components/lists/ListWrapper';
import { SearchInput } from 'src/components/SearchInput';
import {
  ActionFields,
  applyTxHistoryFilters,
  TransactionHistoryItem,
  useTransactionHistory,
} from 'src/hooks/useTransactionHistory';
import { useWeb3Context } from 'src/libs/hooks/useWeb3Context';

import { FilterOptions, HistoryFilterMenu } from './HistoryFilterMenu';
import { HistoryItemLoader } from './HistoryItemLoader';
import { HistoryMobileItemLoader } from './HistoryMobileItemLoader';
import TransactionRowItem from './TransactionRowItem';

const groupByDate = (
  transactions: TransactionHistoryItem[]
): Record<string, TransactionHistoryItem[]> => {
  return transactions.reduce((grouped, transaction) => {
    const date = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(transaction.timestamp * 1000));
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(transaction);
    return grouped;
  }, {} as Record<string, TransactionHistoryItem[]>);
};

export const HistoryWrapper = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingJson, setLoadingJson] = useState(false);
  const [filterQuery, setFilterQuery] = useState<FilterOptions[]>([]);
  const [downloadFormat, setDownloadFormat] = useState('JSON');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuClick = (event: React.MouseEvent<HTMLDivElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleMenuItemClick = (format: string) => {
    setDownloadFormat(format);
    handleMenuClose();
  };

  const {
    data: transactions,
    isLoading,
    fetchNextPage,
    isFetchingNextPage,
    fetchForDownload,
  } = useTransactionHistory();

  const handleDownload = async () => {
    setLoadingJson(true);
    const data = await fetchForDownload({ searchQuery, filterQuery });

    const downloadData = (fileName: string, content: string, mimeType: string) => {
      const file = new Blob([content], { type: mimeType });
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    };

    if (downloadFormat === 'JSON') {
      const jsonData = JSON.stringify(data, null, 2);
      downloadData('transactions.json', jsonData, 'application/json');
    } else if (downloadFormat === 'CSV') {
      // WIP
      const csvData = '';

      downloadData('transactions.csv', csvData, 'text/csv');
    }

    setLoadingJson(false);
  };

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback(
    (node) => {
      if (isLoading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      });
      if (node) observer.current.observe(node);
    },
    [fetchNextPage, isLoading]
  );
  const theme = useTheme();
  const downToMD = useMediaQuery(theme.breakpoints.down('md'));
  const downToXSM = useMediaQuery(theme.breakpoints.down('xsm'));
  const { currentAccount, loading: web3Loading } = useWeb3Context();

  if (!currentAccount) {
    return (
      <ConnectWalletPaper
        loading={web3Loading}
        description={<Trans> Please connect your wallet to view transaction history.</Trans>}
      />
    );
  }

  const flatTxns = transactions?.pages?.flatMap((page) => page) || [];
  const filteredTxns = applyTxHistoryFilters({ searchQuery, filterQuery, txns: flatTxns });
  const isEmpty = filteredTxns.length === 0;

  return (
    <ListWrapper
      titleComponent={
        <Typography component="div" variant="h2" sx={{ mr: 4 }}>
          <Trans>Transactions</Trans>
        </Typography>
      }
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mx: 8, mt: 6, mb: 4 }}>
        <Box sx={{ display: 'inline-flex' }}>
          <HistoryFilterMenu onFilterChange={setFilterQuery} />
          <SearchInput
            onSearchTermChange={setSearchQuery}
            placeholder="Search assets..."
            wrapperSx={{ width: '280px' }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', height: 36, gap: 0.5 }}>
          <DarkTooltip
            title={
              <Typography variant="secondary14" color="common.white">
                <Trans>Download transaction history</Trans>
              </Typography>
            }
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              onClick={handleDownload}
            >
              {loadingJson && <CircularProgress size={16} sx={{ mr: 2 }} color="inherit" />}
              <SvgIcon width={8} height={8}>
                <DownloadIcon />
              </SvgIcon>
              <Typography variant="buttonM" color="text.primary">
                {downToMD ? <Trans>Download</Trans> : <Trans>Download</Trans>}
              </Typography>
            </Box>
          </DarkTooltip>
          <DarkTooltip
            title={
              <Typography variant="secondary14" color="common.white">
                <Trans>Select file format</Trans>
              </Typography>
            }
          >
            <Box
              sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              onClick={handleMenuClick}
            >
              <Typography variant="buttonM" color="text.primary">
                <Trans>{`.${downloadFormat}`}</Trans>
              </Typography>
              <SvgIcon width={14} height={14} sx={{ ml: 0.5 }}>
                <ChevronDownIcon />
              </SvgIcon>
            </Box>
          </DarkTooltip>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
            <MenuItem onClick={() => handleMenuItemClick('JSON')}>
              <Typography variant="buttonM" color="text.primary">
                <Trans>.JSON</Trans>
              </Typography>
            </MenuItem>
            <MenuItem onClick={() => handleMenuItemClick('CSV')}>
              <Typography variant="buttonM" color="text.primary">
                <Trans>.CSV</Trans>
              </Typography>
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {isLoading &&
        (downToXSM ? (
          <>
            <HistoryMobileItemLoader />
            <HistoryMobileItemLoader />
          </>
        ) : (
          <>
            <HistoryItemLoader />
            <HistoryItemLoader />
          </>
        ))}

      {!isEmpty ? (
        Object.entries(groupByDate(filteredTxns)).map(([date, txns], groupIndex) => (
          <React.Fragment key={groupIndex}>
            <Typography variant="h4" color="text.primary" sx={{ ml: 9, mt: 6, mb: 2 }}>
              {date}
            </Typography>
            {txns.map((transaction: TransactionHistoryItem, index: number) => {
              const isLastItem = index === txns.length - 1;
              return (
                <div ref={isLastItem ? lastElementRef : null} key={index}>
                  <TransactionRowItem
                    transaction={
                      transaction as TransactionHistoryItem & ActionFields[keyof ActionFields]
                    }
                    downToXSM={downToXSM}
                  />
                </div>
              );
            })}
          </React.Fragment>
        ))
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            p: 4,
            flex: 1,
          }}
        >
          <Typography sx={{ my: 24 }} variant="h3" color="text.primary">
            <Trans>No transactions yet.</Trans>
          </Typography>
        </Box>
      )}

      <Box
        sx={{ display: 'flex', justifyContent: 'center', mb: isFetchingNextPage ? 6 : 0, mt: 10 }}
      >
        {isFetchingNextPage && (
          <Box
            sx={{
              height: 36,
              width: 186,
              backgroundColor: '#EAEBEF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress size={20} style={{ color: '#383D51' }} />
          </Box>
        )}
      </Box>
    </ListWrapper>
  );
};

export default HistoryWrapper;
