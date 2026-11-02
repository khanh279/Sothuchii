
import { payClass } from '@/domain/ledger';
import type { PayRow } from '@/domain/payForm';
import type { ExpenseRef } from '@/types/expense';/** Loại khoản trả có căn cứ từ dữ liệu: trả bill hoặc chuyển tiền (gộp nợ `bt` đã bị loại khỏi lịch sử). */
export type PayFilter = 'all' | 'bill' | 'loan';

export const PAY_FILTER_LABEL: Record<PayFilter, string> = { all: 'Tất cả', bill: 'Trả bill', loan: 'Chuyển tiền' };

/** Loại của một dòng khoản trả; nhóm nhiều khoản trả bill giữa hai người khác "Tôi" luôn là trả bill. */
export function payRowType(row: PayRow): 'bill' | 'loan' {
  if (row.group) return 'bill';
  return payClass(row.pay) === 'bill' ? 'bill' : 'loan';
}/** Các khoản chi cá nhân do khoản trả này sinh ra (`pay.exp`); rỗng nếu không có căn cứ. */
export function payLinkedExpenses(row: Pick<PayRow, 'group' | 'pay'>): ExpenseRef[] {
  return row.group ? [] : [...(row.pay.exp ?? [])];
}/** Nhãn cho dòng khoản trả đã sinh khoản chi cá nhân (căn cứ `pay.exp`); `null` nếu không có. */
export function payLinkLabel(row: Pick<PayRow, 'group' | 'pay'>): string | null {
  return payLinkedExpenses(row).length > 0 ? 'Đã tính vào chi tiêu' : null;
}