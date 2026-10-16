/**
 * Số liệu phụ ở thẻ tổng chi của Tổng quan (hàm thuần, không đổi công thức tổng): số khoản chi và trung bình mỗi ngày.
 * Trung bình/ngày = tổng chi ÷ số ngày của KỲ ĐANG XEM (cả tháng / cả năm / khoảng tuỳ chọn), làm tròn đồng; kỳ "Tất cả" không có
 * số ngày xác định nên trả về null (ẩn).
 */

import { daysInMonth, daysInclusive } from '@/utils/date';
import type { Period } from '@/types/expense';
import type { Vnd } from '@/types/money';

/** Số ngày của kỳ; null nếu kỳ không giới hạn ("Tất cả"). */
export function periodDayCount(period: Period): number | null {
  switch (period.mode) {
    case 'month':
      return daysInMonth(period.month);
    case 'year':
      return daysInclusive(`${period.year}-01-01`, `${period.year}-12-31`);
    case 'custom':
      return daysInclusive(period.from, period.to);
    case 'all':
      return null;
  }
}

/** Chi tiêu trung bình mỗi ngày của kỳ (đồng, làm tròn); null nếu không xác định số ngày. */
export function averagePerDay(total: Vnd, period: Period): Vnd | null {
  const days = periodDayCount(period);
  if (days === null || days <= 0) return null;
  return Math.round(total / days);
}
