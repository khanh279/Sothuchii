import { useMemo } from 'react';

import { buildPayHistory } from '@/domain/payForm';
import { buildTransactionEntries } from '@/domain/transactionList';
import { useDebtData } from '@/features/debts/hooks';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { useSharedPeriod } from '@/hooks/use-shared-period';

/**
 * Nguồn dữ liệu CHUNG của các trang xem / sửa giao dịch (Tất cả giao dịch, Chi tiêu cá nhân, Chuyển tiền & bill): kỳ dùng chung, khoản chi cá nhân, khoản trả và bill, gộp thành
 * danh sách `entries` bằng `domain/transactionList`. Mỗi trang tự lọc (`filterTransactions`) và tự quyết cách hiển thị; không có kho dữ liệu riêng.
 */
export function useTransactionBook() {
  const { view, setView, period } = useSharedPeriod();
  const { settings, error: settingsError } = useExpenseSettings();
  const { items, loaded: expensesLoaded, error: expensesError, reload: reloadExpenses } = useExpenses(period);
  const debt = useDebtData();

  const entries = useMemo(() => {
    const payRows = buildPayHistory(debt.pays, debt.bills, period).days.flatMap((day) => day.rows);
    return buildTransactionEntries({ expenses: items, payRows, pays: debt.pays });
  }, [items, debt.pays, debt.bills, period]);

  return {
    view,
    setView,
    period,
    settings,
    /** Các khoản chi cá nhân của kỳ (chưa lọc). */
    items,
    entries,
    bills: debt.bills,
    reloadExpenses,
    reloadDebt: debt.reload,
    loaded: expensesLoaded && debt.loaded,
    message: settingsError ?? expensesError ?? debt.error,
  };
}
