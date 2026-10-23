import { useMemo } from 'react';

import { isInPeriod, resolveCategory } from '@/domain/expenses';
import { buildRecentTransactions, type RecentTransaction } from '@/domain/recentTransactions';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import type { Period } from '@/types/expense';
import type { Pay } from '@/types/pay';

interface Options {
  /** Khoảng thời gian đọc khoản chi cá nhân. */
  window: Period;
  /** Có = chỉ giữ khoản trả trong kỳ này (khoản chi cá nhân đã đọc đúng theo `window`). */
  filterPeriod?: Period;
  /** Các khoản trả đã đọc ở màn hình (cùng nguồn với khung Công nợ) và trạng thái đọc. */
  pays: readonly Pay[];
  paysLoaded: boolean;
  paysError: string | null;
  limit: number;
}

/**
 * Nguồn giao dịch dùng chung cho "Giao dịch gần đây" (Tổng quan) và trang "Giao dịch": gộp bằng `buildRecentTransactions`
 * HAI nguồn: chi tiêu cá nhân và giao dịch (trả bill, chuyển tiền) từ các kho đã có (không có kho dữ liệu riêng). Chỉ đọc.
 */
export function useTransactionFeed({ window, filterPeriod, pays, paysLoaded, paysError, limit }: Options) {
  const { items, loaded, error } = useExpenses(window);
  const { settings } = useExpenseSettings();

  const list = useMemo<RecentTransaction[]>(() => {
    const inPeriod = (date: string) => !filterPeriod || isInPeriod(date, filterPeriod);
    return buildRecentTransactions({
      expenses: items,
      pays: pays.filter((pay) => inPeriod(String(pay.date))),
      categoryName: (id) => resolveCategory(settings, id).name,
      limit,
    });
  }, [items, pays, settings, filterPeriod, limit]);

  return {
    list,
    settings,
    loaded: loaded && paysLoaded,
    error: error ?? paysError,
  };
}
