/**
 * Tab "Chi tiêu" (hàm thuần): tách hai mục Chi tiêu (khoản chi cá nhân) và Giao dịch (khoản trả / chuyển tiền), chỉ tái dùng dữ liệu và
 * quy tắc đã có — không tạo bản ghi, không đổi công thức tổng. Tổng chi tiêu vẫn là tổng các khoản chi cá nhân của kỳ (`sumAmounts`);
 * khoản trả KHÔNG được cộng vào tổng, kể cả khi nó đã sinh một khoản chi `src:'cb'` (liên kết bằng `pay.exp`, khoản chi đó đã nằm trong tổng).
 */

import { payClass } from '@/domain/ledger';
import type { PayDay, PayRow } from '@/domain/payForm';
import type { ExpenseRef } from '@/types/expense';

export type PaySegment = 'expense' | 'pay';

/** Loại khoản trả có căn cứ từ dữ liệu: trả bill hoặc chuyển tiền (gộp nợ `bt` đã bị loại khỏi lịch sử). */
export type PayFilter = 'all' | 'bill' | 'loan';

export const PAY_FILTER_LABEL: Record<PayFilter, string> = { all: 'Tất cả', bill: 'Trả bill', loan: 'Chuyển tiền' };

/** Loại của một dòng khoản trả; nhóm nhiều khoản trả bill giữa hai người khác "Tôi" luôn là trả bill. */
export function payRowType(row: PayRow): 'bill' | 'loan' {
  if (row.group) return 'bill';
  return payClass(row.pay) === 'bill' ? 'bill' : 'loan';
}

/** Các loại thực sự có trong danh sách (để chỉ tạo nút lọc cho loại có dữ liệu), theo thứ tự cố định. */
export function payTypesInUse(days: readonly PayDay[]): ('bill' | 'loan')[] {
  const found = new Set<'bill' | 'loan'>();
  for (const day of days) for (const row of day.rows) found.add(payRowType(row));
  return (['bill', 'loan'] as const).filter((type) => found.has(type));
}

/** Giữ lại các dòng đúng loại; bỏ những ngày không còn dòng nào. `all` trả về nguyên danh sách. */
export function filterPayDays(days: readonly PayDay[], filter: PayFilter): PayDay[] {
  if (filter === 'all') return [...days];
  return days
    .map((day) => ({ ...day, rows: day.rows.filter((row) => payRowType(row) === filter) }))
    .filter((day) => day.rows.length > 0);
}

/** Số dòng khoản trả trong danh sách đã lọc. */
export const countPayRows = (days: readonly PayDay[]): number => days.reduce((sum, day) => sum + day.rows.length, 0);

/** Các khoản chi cá nhân do khoản trả này sinh ra (`pay.exp`); rỗng nếu không có căn cứ. */
export function payLinkedExpenses(row: Pick<PayRow, 'group' | 'pay'>): ExpenseRef[] {
  return row.group ? [] : [...(row.pay.exp ?? [])];
}

/** Nhãn liên kết cho khoản chi tự sinh (theo `src`, đúng quy tắc bảo vệ hiện có); `null` với khoản người dùng tự nhập. */
export function expenseLinkLabel(expense: { src?: string }): string | null {
  if (expense.src === 'cb') return 'Liên kết bill';
  if (expense.src === 'quy') return 'Từ quỹ nhóm';
  return null;
}

/** Nhãn cho dòng khoản trả đã sinh khoản chi cá nhân (căn cứ `pay.exp`); `null` nếu không có. */
export function payLinkLabel(row: Pick<PayRow, 'group' | 'pay'>): string | null {
  return payLinkedExpenses(row).length > 0 ? 'Đã tính vào chi tiêu' : null;
}
