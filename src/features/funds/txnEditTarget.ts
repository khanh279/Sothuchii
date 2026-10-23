import { advanceById, advanceSummary, personalDebt } from '@/domain/fundAdvance';
import type { FundActionTarget } from '@/features/funds/FundActionSheet';
import type { FundData } from '@/types/fund';

/**
 * Dữ liệu để SỬA một giao dịch hoàn tiền / thanh toán đã ghi: loại và khoản gốc xác định từ DỮ LIỆU (không từ chữ trên thẻ); số tối đa tính trên dữ liệu đã bỏ chính
 * giao dịch này (để kiểm tra số tiền mới đúng). Trả `null` khi giao dịch hoặc khoản gốc không còn.
 */
export function buildTxnEditTarget(data: FundData, txnId: string) {
  const txn = data.txns?.find((item) => item.id === txnId);
  if (!txn) return null;
  const without = { ...data, txns: (data.txns ?? []).filter((item) => item.id !== txn.id) };
  const existing = { id: txn.id, amount: txn.amount, date: txn.date };
  if (txn.kind === 'refund' && txn.advanceId) {
    const advance = advanceById(without, txn.advanceId);
    if (!advance) return null;
    return { data: without, existing, target: { mode: 'refund', advanceId: advance.id, max: advanceSummary(without, advance).held } as FundActionTarget };
  }
  if (txn.kind === 'payout' && txn.expenseId) {
    const expense = without.expenses.find((item) => item.id === txn.expenseId);
    if (!expense) return null;
    return { data: without, existing, target: { mode: 'payout', expenseId: expense.id, person: expense.payer ?? txn.person, max: personalDebt(without, expense).remaining } as FundActionTarget };
  }
  if (txn.kind === 'payout' && txn.advanceId) {
    const advance = advanceById(without, txn.advanceId);
    if (!advance) return null;
    return { data: without, existing, target: { mode: 'payout', advanceId: advance.id, person: advance.person, max: advanceSummary(without, advance).owed } as FundActionTarget };
  }
  return null;
}
