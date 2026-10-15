import type { DateStr, MonthKey } from '@/types/expense';

/**
 * Tiện ích ngày theo GIỜ MÁY, dùng chuỗi 'YYYY-MM-DD' / 'YYYY-MM' như PWA.
 * Không dùng toISOString() (sẽ lệch ngày theo múi giờ).
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

export const WEEKDAY_NAMES = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
] as const;

export function formatDateStr(date: Date): DateStr {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayStr(now: Date = new Date()): DateStr {
  return formatDateStr(now);
}

export function monthOf(date: DateStr): MonthKey {
  return date.slice(0, 7);
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Đúng định dạng và là ngày có thật (không có 2025-02-30). */
export function isValidDateStr(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function addDays(date: DateStr, delta: number): DateStr {
  const [y, m, d] = date.split('-').map(Number);
  return formatDateStr(new Date(y, m - 1, d + delta));
}

/** Số ngày từ `from` đến `to`, tính cả hai đầu. Cùng ngày = 1. */
export function daysInclusive(from: DateStr, to: DateStr): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 864e5) + 1;
}

/** Các tháng từ `from` đến `to`, tối đa `limit` tháng. */
export function monthsBetween(from: MonthKey, to: MonthKey, limit = 62): MonthKey[] {
  const months: MonthKey[] = [];
  let cursor = from;
  while (cursor <= to && months.length < limit) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/** '2025-10-08' -> '08/10/2025'. */
export function formatVnDate(date: DateStr): string {
  return `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function weekdayName(date: DateStr): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
}

/** 'YYYY-MM-DD' -> Date lúc 00:00 giờ máy (dùng cho bộ chọn ngày). */
export function dateFromStr(date: DateStr): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}
