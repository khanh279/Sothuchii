
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { deleteBillSynced } from '@/data/billService';
import { deletePaySynced } from '@/data/payService';
import { payLinkLabel } from '@/domain/expenseTab';
import type { PayRow } from '@/domain/payForm';
import { billOfExpense, expenseSourceLabel, type TransactionEntry } from '@/domain/transactionList';
import { describeBillError } from '@/features/bills/hooks';
import { describeDebtError } from '@/features/debts/hooks';
import { PayRowView } from '@/features/debts/PayRowView';
import { ExpenseRow } from '@/features/expenses/ExpenseRow';
import { useExpenseRowActions } from '@/features/expenses/useExpenseRowActions';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import type { Bill } from '@/types/bill';
import type { ExpenseSettings, Period } from '@/types/expense';
import { router } from '@/utils/safe-router';

interface Options {
  settings: ExpenseSettings;
  bills: readonly Bill[];
  period: Period;
  reloadExpenses: () => Promise<void> | void;
  reloadDebt: () => Promise<void> | void;
  /**
   * true: khoản chi sinh từ Chia bill bị KHOÁ (trang Chi tiêu cá nhân: chỉ sửa ở bill). false: Sửa / Xoá / chạm chuyển sang bill gốc (căn cứ `bill.exp`).
   * Khoản chi sinh từ quỹ / khoản trả luôn khoá.
   */
  lockBillExpenses: boolean;
}

/**
 * Cách dựng MỘT dòng giao dịch dùng chung cho các trang xem / sửa giao dịch: dòng khoản chi (`ExpenseRow`) và dòng khoản trả (`PayRowView`) với vuốt Sửa / Xoá,
 * chạm xem chi tiết, nhãn nguồn và quy tắc khoá. Mỗi trang chỉ quyết định BỐ CỤC xung quanh (tiêu đề, bộ lọc, tóm tắt, nhóm theo ngày).
 */
export function useTransactionRows({ settings, bills, period, reloadExpenses, reloadDebt, lockBillExpenses }: Options) {
  const toast = useToast();
  const { closeAll, rowProps } = useSingleOpenRow();
  const { remove: removeExpense, edit: editExpense, openDetail } = useExpenseRowActions({ period, reload: reloadExpenses });

  async function removePay(row: PayRow) {
    try {
      await deletePaySynced(row.ids);
      closeAll();
      toast.show('Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await reloadDebt();
    } catch (e) {
      toast.show(describeDebtError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  async function removeBill(id: string) {
    try {
      await deleteBillSynced(id);
      toast.show('Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await Promise.all([reloadDebt(), reloadExpenses()]);
    } catch (e) {
      toast.show(describeBillError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  function renderEntry(entry: TransactionEntry) {
    if (entry.kind === 'pay') {
      const { row } = entry;
      return <PayRowView key={entry.key} row={row} rowProps={rowProps(entry.key)} onDelete={() => void removePay(row)} badge={payLinkLabel(row) ?? undefined} />;
    }
    const { expense } = entry;
    const props = rowProps(entry.key);
    const sourceBill = lockBillExpenses ? null : billOfExpense(bills, expense);
    return (
      <ExpenseRow
        key={entry.key}
        item={expense}
        settings={settings}
        open={props.open}
        onOpen={props.onOpen}
        onClose={props.onClose}
        onPressRow={() => {
          closeAll();
          if (sourceBill) router.push({ pathname: '/chia-bill/chi-tiet', params: { id: sourceBill.id } });
          else openDetail(expense);
        }}
        onPressLocked={() => openDetail(expense)}
        onEdit={() => (sourceBill ? router.push({ pathname: '/chia-bill/sua', params: { id: sourceBill.id } }) : editExpense(expense))}
        onDelete={() => {
          closeAll();
          if (sourceBill) void removeBill(sourceBill.id);
          else void removeExpense(expense);
        }}
        badge={expenseSourceLabel(expense, entry.shadow, !!sourceBill) ?? undefined}
        unlocked={!!sourceBill}
      />
    );
  }

  return { renderEntry, closeAll };
}
