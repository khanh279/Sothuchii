/**
 * Chi tiêu gom theo ngày / tuần / tháng / năm cho biểu đồ cột của tab Chi tiêu (hàm thuần, chỉ ĐỌC dữ liệu). Tiền là ĐỒNG.
 * Các khoản chi đưa vào đã được lọc theo kỳ (`useExpenses`); ở đây chỉ chọn mức gom và cộng:
 * - Tháng: mỗi cột một ngày. Năm: mỗi cột một tháng.
 * - Tuỳ chọn: đến 31 ngày theo ngày; đến 120 ngày theo tuần (thứ hai → chủ nhật); dài hơn theo tháng.
 * - Tất cả: từ khoản chi đầu tiên đến cuối cùng; trong một tháng theo ngày, đến 24 tháng theo tháng, dài hơn theo năm.
 * Chỉ có MỘT cột (ví dụ khoảng một ngày) hoặc không có khoản chi nào để vẽ thì trả `null` (không hiện biểu đồ).
 * Ngày xử lý bằng chuỗi `YYYY-MM-DD` giờ địa phương (`addDays`, `daysInclusive`), không đi qua `toISOString`.
 */

import type { Expense, Period } from '@/types/expense';
import type { Vnd } from '@/types/money';
import { addDays, daysInclusive } from '@/utils/date';

export type SpendUnit = 'day' | 'week' | 'month' | 'year';

export interface SpendBucket {
  /** Thứ tự từ 1 trong biểu đồ. */
  index: number;
  /** Khoá duy nhất: `YYYY-MM-DD` (ngày; tuần = thứ hai đầu tuần), `YYYY-MM` (tháng) hoặc `YYYY` (năm). */
  key: string;
  /** Ngày đầu và ngày cuối (gồm cả hai) mà cột này đại diện. */
  start: string;
  end: string;
  amount: Vnd;
}

export interface SpendSeries {
  unit: SpendUnit;
  buckets: SpendBucket[];
  total: Vnd;
  /** Số lớn nhất của một cột (0 nếu không có khoản chi). */
  max: Vnd;
  /** Cột có số lớn nhất (cột đầu nếu bằng nhau); `null` nếu không có khoản chi. */
  peak: SpendBucket | null;
}

/** Biên các mức gom của kỳ Tuỳ chọn và Tất cả. */
export const MAX_DAY_BUCKETS = 31;
export const MAX_WEEK_DAYS = 120;
export const MAX_MONTH_BUCKETS = 24;

const pad = (n: number): string => String(n).padStart(2, '0');
const parts = (date: string): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
};

/** Số ngày của tháng `YYYY-MM` (tính theo lịch, không phụ thuộc múi giờ). */
export function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon, 0).getDate();
}

/** Thứ hai của tuần chứa `date`. */
export function mondayOf(date: string): string {
  const [y, m, d] = parts(date);
  const weekday = new Date(y, m - 1, d).getDay(); // 0 = chủ nhật
  return addDays(date, -((weekday + 6) % 7));
}

interface Frame {
  unit: SpendUnit;
  buckets: SpendBucket[];
  /** Vị trí cột của một ngày (có thể ngoài phạm vi). */
  indexOf: (date: string) => number;
}

const empty = (index: number, key: string, start: string, end: string): SpendBucket => ({ index, key, start, end, amount: 0 });

function dayFrame(from: string, to: string): Frame {
  const count = daysInclusive(from, to);
  const buckets = Array.from({ length: count }, (_, i) => {
    const date = addDays(from, i);
    return empty(i + 1, date, date, date);
  });
  return { unit: 'day', buckets, indexOf: (date) => daysInclusive(from, date) - 1 };
}

function weekFrame(from: string, to: string): Frame {
  const first = mondayOf(from);
  const buckets: SpendBucket[] = [];
  for (let start = first; start <= to; start = addDays(start, 7)) buckets.push(empty(buckets.length + 1, start, start, addDays(start, 6)));
  return { unit: 'week', buckets, indexOf: (date) => Math.floor((daysInclusive(first, date) - 1) / 7) };
}

function monthFrame(fromMonth: string, toMonth: string): Frame {
  const [y0, m0] = fromMonth.split('-').map(Number);
  const [y1, m1] = toMonth.split('-').map(Number);
  const count = (y1 - y0) * 12 + (m1 - m0) + 1;
  const buckets = Array.from({ length: count }, (_, i) => {
    const total = y0 * 12 + (m0 - 1) + i;
    const key = `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
    return empty(i + 1, key, `${key}-01`, `${key}-${pad(daysInMonth(key))}`);
  });
  return { unit: 'month', buckets, indexOf: (date) => (Number(date.slice(0, 4)) - y0) * 12 + (Number(date.slice(5, 7)) - m0) };
}

function yearFrame(fromYear: number, toYear: number): Frame {
  const buckets = Array.from({ length: toYear - fromYear + 1 }, (_, i) => {
    const year = fromYear + i;
    return empty(i + 1, String(year), `${year}-01-01`, `${year}-12-31`);
  });
  return { unit: 'year', buckets, indexOf: (date) => Number(date.slice(0, 4)) - fromYear };
}

/** Chọn khung cột theo kỳ; `null` nếu kỳ không vẽ được (ví dụ Tất cả mà chưa có khoản chi, hoặc khoảng sai thứ tự). */
function frameFor(items: readonly Pick<Expense, 'a' | 'd'>[], period: Period): Frame | null {
  if (period.mode === 'month') return dayFrame(`${period.month}-01`, `${period.month}-${pad(daysInMonth(period.month))}`);
  if (period.mode === 'year') return monthFrame(`${period.year}-01`, `${period.year}-12`);
  if (period.mode === 'custom') {
    const days = daysInclusive(period.from, period.to);
    if (!(days >= 1)) return null;
    if (days <= MAX_DAY_BUCKETS) return dayFrame(period.from, period.to);
    if (days <= MAX_WEEK_DAYS) return weekFrame(period.from, period.to);
    return monthFrame(period.from.slice(0, 7), period.to.slice(0, 7));
  }
  // Tất cả: theo phạm vi ngày thực có chi tiêu.
  const dates = items.map((item) => item.d).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  if (dates.length === 0) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  const months = (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(last.slice(5, 7)) - Number(first.slice(5, 7))) + 1;
  if (months <= 1) return dayFrame(first, last);
  if (months <= MAX_MONTH_BUCKETS) return monthFrame(first.slice(0, 7), last.slice(0, 7));
  return yearFrame(Number(first.slice(0, 4)), Number(last.slice(0, 4)));
}

export function buildSpendSeries(items: readonly Pick<Expense, 'a' | 'd'>[], period: Period): SpendSeries | null {
  const frame = frameFor(items, period);
  if (!frame || frame.buckets.length < 2) return null;
  const { buckets } = frame;
  for (const item of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.d)) continue;
    const i = frame.indexOf(item.d);
    if (i >= 0 && i < buckets.length) buckets[i].amount += item.a;
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  const peak = buckets.reduce<SpendBucket | null>((best, bucket) => (bucket.amount > (best?.amount ?? 0) ? bucket : best), null);
  return { unit: frame.unit, buckets, total, max: peak?.amount ?? 0, peak };
}
