/**
 * Nhãn hiển thị của bộ lọc thời gian dùng chung (hàm thuần). Chỉ DIỄN ĐẠT kỳ đang chọn; không đổi cách lọc dữ liệu
 * (cách lọc vẫn do `isInPeriod` / `periodOf` quyết định).
 */

import { monthHeading } from '@/domain/expenses';
import type { DateStr, Period } from '@/types/expense';
import { daysInMonth, formatVnDate } from '@/utils/date';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Ngày đầu / cuối của kỳ (gồm cả hai đầu); null với "Tất cả" vì không có khoảng ngày xác định. */
export function periodRange(period: Period): { from: DateStr; to: DateStr } | null {
  switch (period.mode) {
    case 'month':
      return { from: `${period.month}-01`, to: `${period.month}-${pad2(daysInMonth(period.month))}` };
    case 'year':
      return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
    case 'custom':
      return { from: period.from, to: period.to };
    case 'all':
      return null;
  }
}

/** Tên kỳ ở dòng thu gọn, ví dụ "Tháng 10, 2026", "Năm 2026", "Tất cả", "Tuỳ chọn". */
export function periodHeading(period: Period): string {
  switch (period.mode) {
    case 'month':
      return monthHeading(period.month);
    case 'year':
      return `Năm ${period.year}`;
    case 'all':
      return 'Tất cả';
    case 'custom':
      return 'Tuỳ chọn';
  }
}

/**
 * Khoảng ngày dưới tên kỳ: cùng năm thì rút gọn "01/10 – 31/10/2026", khác năm thì đủ hai đầu dd/MM/yyyy.
 * "Tất cả" không có khoảng ngày nên chỉ ghi "Toàn bộ thời gian" (không bịa ngày).
 */
export function periodRangeLabel(period: Period): string {
  const range = periodRange(period);
  if (!range) return 'Toàn bộ thời gian';
  const from = formatVnDate(range.from);
  const to = formatVnDate(range.to);
  return range.from.slice(0, 4) === range.to.slice(0, 4) ? `${from.slice(0, 5)} – ${to}` : `${from} – ${to}`;
}
