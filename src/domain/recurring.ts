/**
 * Chi tiêu ĐỊNH KỲ (hàm thuần): một quy tắc "mỗi tháng vào ngày N ghi khoản chi A đồng, mục C, nội dung X" (ví dụ tiền nhà, internet). Ứng dụng tự ghi các khoản đến hạn khi mở: với mỗi tháng từ
 * tháng bắt đầu (hoặc sau tháng đã xử lý lần trước) đến tháng hiện tại, nếu ngày hạn không sau hôm nay thì ghi một khoản chi vào đúng ngày hạn. Ngày hạn lớn hơn số ngày của tháng (30, 31)
 * lùi về ngày cuối tháng. Tiền là ĐỒNG; ngày theo giờ địa phương (chuỗi YYYY-MM-DD do người gọi truyền vào).
 */

import type { DateStr, Expense, MonthKey } from '@/types/expense';
import type { Vnd } from '@/types/money';
import { addMonths, daysInMonth, monthOf } from '@/utils/date';

export interface RecurringExpense {
  id: string;
  a: Vnd;
  /** Id mục chi. */
  c: string;
  /** Nội dung khoản chi. */
  n: string;
  /** Ngày hạn trong tháng, 1–31. */
  day: number;
  /** Tháng đầu tiên được ghi. */
  from: MonthKey;
  /** Tháng gần nhất đã xử lý (đã ghi hoặc đã đến hạn); thiếu = chưa xử lý tháng nào. */
  done?: MonthKey;
}

export interface DueRecurring {
  ruleId: string;
  month: MonthKey;
  expense: Expense;
  /** Mã cố định của khoản chi (không đổi giữa các lần chạy) để không ghi trùng. */
  expenseId: string;
}

/** Nhãn ghi ở dòng chi tiết phụ của khoản chi tự ghi từ chi tiêu định kỳ. */
export const RECURRING_NOTE = 'Chi tiêu định kỳ';

export const dueDate = (month: MonthKey, day: number): DateStr => `${month}-${String(Math.min(Math.max(1, Math.round(day)), daysInMonth(month))).padStart(2, '0')}`;

/** Các khoản đến hạn tính đến `today`: mỗi quy tắc một khoản cho mỗi tháng chưa xử lý có ngày hạn không sau hôm nay (tối đa 24 tháng mỗi lần để chặn vòng lặp dài). */
export function dueRecurring(rules: readonly RecurringExpense[], today: DateStr, now: number): DueRecurring[] {
  const thisMonth = monthOf(today);
  const result: DueRecurring[] = [];
  for (const rule of rules) {
    let month = rule.done ? addMonths(rule.done, 1) : rule.from;
    if (month < rule.from) month = rule.from;
    for (let step = 0; month <= thisMonth && step < 24; step++, month = addMonths(month, 1)) {
      const date = dueDate(month, rule.day);
      if (date > today) break;
      result.push({ ruleId: rule.id, month, expenseId: `rec-${rule.id}-${month}`, expense: { a: rule.a, c: rule.c, n: rule.n, d: date, t: now, i: RECURRING_NOTE } });
    }
  }
  return result;
}

/** Cập nhật `done` của các quy tắc sau khi đã xử lý các khoản `due`: tháng lớn nhất đã xử lý của mỗi quy tắc. */
export function markDone(rules: readonly RecurringExpense[], due: readonly DueRecurring[]): RecurringExpense[] {
  return rules.map((rule) => {
    const months = due.filter((item) => item.ruleId === rule.id).map((item) => item.month);
    if (months.length === 0) return rule;
    const last = months.reduce((max, month) => (month > max ? month : max));
    return rule.done && rule.done >= last ? rule : { ...rule, done: last };
  });
}

/** Đọc danh sách quy tắc đã lưu: bỏ mục sai dạng (số tiền ≤ 0, ngày ngoài 1–31, tháng bắt đầu sai). */
export function normalizeRecurring(raw: unknown): RecurringExpense[] {
  if (!Array.isArray(raw)) return [];
  const result: RecurringExpense[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const a = Math.round(Number(r.a));
    const day = Math.round(Number(r.day));
    const from = typeof r.from === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.from) ? r.from : '';
    if (typeof r.id !== 'string' || !r.id || !(a > 0) || !(day >= 1 && day <= 31) || !from) continue;
    const done = typeof r.done === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.done) ? r.done : undefined;
    result.push({ id: r.id, a, c: typeof r.c === 'string' && r.c ? r.c : 'other', n: typeof r.n === 'string' ? r.n.slice(0, 80) : '', day, from, ...(done ? { done } : {}) });
  }
  return result;
}
