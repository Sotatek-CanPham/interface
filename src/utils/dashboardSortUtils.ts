import { InterestRate } from '@aave/contract-helpers';
import { BorrowAssetsItem } from 'src/modules/dashboard/lists/BorrowAssetsList/types';
import { SupplyAssetsItem } from 'src/modules/dashboard/lists/SupplyAssetsList/types';

// Sorting keys
import {
  ComputedReserveData,
  ComputedUserReserveData,
} from '../hooks/app-data-provider/useAppDataProvider';

// Helpers
export const DASHBOARD_LIST_COLUMN_WIDTHS = {
  ASSET: 130,
  BUTTONS: 160,
  CELL: 130,
};

// Note: Create a single type that works with all four dashboards list and all 8 list item components
// Each list item may need a combination of a few types but not all, i.e. positions vs assets and supplied vs borrowed
type DashboardReserveData = ComputedUserReserveData &
  ComputedReserveData &
  BorrowAssetsItem &
  SupplyAssetsItem;

export type DashboardReserve = DashboardReserveData & {
  // Additions
  borrowRateMode: InterestRate; // for the borrow positions list
  // Overrides
  reserve: ComputedReserveData;
};

export const handleSortDashboardReserves = (
  sortDesc: boolean,
  sortName: string,
  sortPosition: string,
  positions: DashboardReserve[],
  isBorrowedPosition?: boolean,
  prioritySymbol?: string
): DashboardReserve[] => {
  if (sortDesc) {
    return handleSortDesc(sortName, sortPosition, positions, isBorrowedPosition || false);
  } else {
    return sortAsc(sortName, sortPosition, positions, isBorrowedPosition || false, prioritySymbol);
  }
};

const handleSortDesc = (
  sortName: string,
  sortPosition: string,
  positions: DashboardReserve[],
  isBorrowedPosition: boolean
) => {
  if (sortName === 'symbol') {
    return handleSymbolSort(true, sortPosition, positions);
  } else if (sortName === 'usageAsCollateralEnabledOnUser' || sortName === 'debt') {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return positions.sort((a, b) => Number(a[sortName]) - Number(b[sortName]));
  } else {
    if (isBorrowedPosition) {
      positions.sort((a, b) =>
        a.borrowRateMode === 'Variable'
          ? Number(b.reserve.variableBorrowAPY) - Number(a.reserve.variableBorrowAPY)
          : Number(b.reserve.stableBorrowAPY) - Number(a.reserve.stableBorrowAPY)
      );
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return positions.sort((a, b) => a[sortName] - b[sortName]);
  }
};

const sortAsc = (
  sortName: string,
  sortPosition: string,
  positions: DashboardReserve[],
  isBorrowedPosition: boolean,
  prioritySymbol?: string
) => {
  if (sortName === 'symbol') {
    return handleSymbolSort(false, sortPosition, positions);
  } else if (sortName === 'usageAsCollateralEnabledOnUser' || sortName === 'debt') {
    // NOTE parse to number for sorting
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return positions.sort((a, b) => Number(b[sortName]) - Number(a[sortName]));
  } else {
    // Note because borrow positions have extra logic we need to have this
    if (isBorrowedPosition) {
      positions.sort((a, b) =>
        a.borrowRateMode === 'Variable'
          ? Number(a.reserve.variableBorrowAPY) - Number(b.reserve.variableBorrowAPY)
          : Number(a.reserve.stableBorrowAPY) - Number(b.reserve.stableBorrowAPY)
      );
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const sorted = positions.sort((a, b) => a[sortName] - b[sortName]);

    if (prioritySymbol) {
      const priorityItemIndex = positions.findIndex(
        (item) => item.reserve.symbol === prioritySymbol
      );
      if (priorityItemIndex > -1) {
        const [priorityItem] = positions.splice(priorityItemIndex, 1);
        return [priorityItem, ...sorted];
      }
    }

    return sorted;
  }
};

const handleSymbolSort = (
  sortDesc: boolean,
  sortPosition: string,
  positions: DashboardReserve[]
) => {
  // NOTE because the data structure is different we need to check for positions(supplied|borrowed)
  // if position then a.reserve.symbol otherwise a.symbol
  if (sortDesc) {
    if (sortPosition === 'position') {
      return positions.sort((a, b) =>
        a.reserve.symbol.toUpperCase() < b.reserve.symbol.toUpperCase() ? -1 : 1
      );
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return positions.sort((a, b) => (a.symbol.toUpperCase() < b.symbol.toUpperCase() ? -1 : 1));
  }

  if (sortPosition === 'position') {
    return positions.sort((a, b) =>
      b.reserve.symbol.toUpperCase() < a.reserve.symbol.toUpperCase() ? -1 : 1
    );
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return positions.sort((a, b) => (b.symbol.toUpperCase() < a.symbol.toUpperCase() ? -1 : 1));
};
