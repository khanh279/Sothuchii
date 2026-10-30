/**
 * Danh sách của trang "Tất cả giao dịch" (hàm thuần): gộp khoản chi cá nhân và khoản trả / chuyển tiền (đã gom dòng bằng `buildPayHistory`)
 * để xem, sửa, xoá ở MỘT nơi. Chỉ tái dùng dữ liệu và quy tắc đã có, không tạo bản ghi, không đổi công thức tổng.
 *
 * Bốn mục lọc (và `loanBill` = chuyển tiền + bill, cho trang Chuyển tiền & bill; trang đó và trang Chi tiêu cá nhân dùng cùng danh sách này nhưng hiển thị riêng):
 * - `all`: mọi giao dịch, trừ khoản chi "bóng" của một khoản trả (`pay.exp` trỏ tới) vì dòng khoản trả đã thể hiện khoản tiền đó.
 * - `expense`: TẤT CẢ khoản chi cá nhân của kỳ (kể cả khoản tự sinh từ Chia bill / Quỹ nhóm / khoản trả), đúng danh sách làm nên tổng chi tiêu.
 * - `loan`: khoản chuyển tiền (không phải trả bill).
 * - `bill`: khoản trả bill và khoản chi cá nhân sinh từ Chia bill (không kể khoản chi bóng của khoản trả).
 */

import { payRowType } from '@/domain/expenseTab';
import type { PayRow } from '@/domain/payForm';
import type { Bill } from '@/types/bill';
import type { ExpenseWithId } from '@/types/expense';
import type { Vnd } from '@/types/money';
import type { Pay } from '@/types/pay';
import { monthOf } from '@/utils/date';

export type TransactionTab = 'all' | 'expense' | 'loan' | 'bill';

export const TRANSACTION_TABS: readonly TransactionTab[] = ['all', 'expense', 'loan', 'bill'];

/** Thêm "chuyển tiền + bill" (không có chi tiêu thường) cho trang Chuyển tiền & bill; trang Tất cả giao dịch chỉ dùng bốn mục `TransactionTab`. */
export type TransactionFilter = TransactionTab | 'loanBill';

export const isTransactionTab = (value: unknown): value is TransactionTab => TRANSACTION_TABS.includes(value as TransactionTab);

interface EntryBase {
  /** Khoá duy nhất. */
  key: string;
  date: string;
  /** Thứ tự trong ngày (thời điểm tạo, ms). */
  order: number;
}

export type TransactionEntry =
  | (EntryBase & { kind: 'expense'; expense: ExpenseWithId; shadow: boolean })
  | (EntryBase & { kind: 'pay'; row: PayRow });

export interface TransactionDay {
  date: string;
  entries: TransactionEntry[];
}

export interface TransactionTotals {
  count: number;
  /** Tiền ra / vào của tôi; khoản trả giữa hai người khác "Tôi" không tính. */
  out: Vnd;
  in: Vnd;
}

interface BuildInput {
  expenses: readonly ExpenseWithId[];
  /** Các dòng khoản trả đã gom theo ngày (`buildPayHistory(...).days`). */
  payRows: readonly PayRow[];
  /** Mọi khoản trả (để biết khoản chi nào là "bóng" của một khoản trả). */
  pays: readonly Pay[];
}

/** Tất cả giao dịch, ngày giảm dần; cùng ngày thì tạo sau trước. */
export function buildTransactionEntries({ expenses, payRows, pays }: BuildInput): TransactionEntry[] {
  const shadowed = new Set<string>();
  for (const pay of pays) for (const ref of pay.exp ?? []) shadowed.add(`${ref.m}/${ref.id}`);

  const list: TransactionEntry[] = [];
  for (const expense of expenses) {
    const ref = `${monthOf(expense.d)}/${expense.id}`;
    list.push({ kind: 'expense', key: `expense:${ref}`, date: expense.d, order: expense.t || 0, expense, shadow: shadowed.has(ref) });
  }
  for (const row of payRows) {
    list.push({ kind: 'pay', key: `pay:${row.ids.join(',')}`, date: String(row.date), order: row.pay.createdAt || 0, row });
  }
  return list.sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order || b.key.localeCompare(a.key));
}

/** Bill đã sinh ra khoản chi cá nhân `src:'cb'` này (căn cứ `bill.exp`); `null` nếu không có (khoản chi tự sinh từ khoản trả, hoặc bill đã xoá). */
export function billOfExpense(bills: readonly Bill[], expense: Pick<ExpenseWithId, 'id' | 'd' | 'src'>): Bill | null {
  if (expense.src !== 'cb') return null;
  const month = monthOf(expense.d);
  return bills.find((bill) => bill.exp?.m === month && bill.exp.id === expense.id) ?? null;
}

/**
 * Nhãn cho khoản chi tự sinh, nói rõ SỬA Ở ĐÂU: `null` với khoản người dùng tự nhập (sửa thẳng được).
 * - Từ quỹ nhóm: "Sửa tại quỹ nhóm" (luôn khoá ở trang này).
 * - Bóng của khoản trả: "Sửa tại khoản trả" (khoá; sửa ở dòng khoản trả).
 * - Phần chia bill: "Sửa theo bill" khi Sửa / Xoá ở đây chuyển sang bill gốc (`viaBill`), còn khi khoá (mục Chi tiêu) là "Sửa tại bill".
 */
export function expenseSourceLabel(expense: Pick<ExpenseWithId, 'src'>, shadow: boolean, viaBill: boolean): string | null {
  if (expense.src === 'quy') return 'Sửa tại quỹ nhóm';
  if (expense.src !== 'cb') return null;
  if (shadow) return 'Sửa tại khoản trả';
  return viaBill ? 'Sửa theo bill' : 'Sửa tại bill';
}

/** Giao dịch có thuộc mục lọc này không. */
export function inTransactionTab(entry: TransactionEntry, tab: TransactionFilter): boolean {
  if (tab === 'loanBill') return inTransactionTab(entry, 'loan') || inTransactionTab(entry, 'bill');
  if (tab === 'expense') return entry.kind === 'expense';
  if (entry.kind === 'expense') {
    if (entry.shadow) return false;
    return tab === 'all' || (tab === 'bill' && entry.expense.src === 'cb');
  }
  if (tab === 'all') return true;
  return payRowType(entry.row) === tab;
}

export const filterTransactions = (entries: readonly TransactionEntry[], tab: TransactionFilter): TransactionEntry[] => entries.filter((entry) => inTransactionTab(entry, tab));

/** Gom theo ngày, giữ thứ tự đã có. */
export function groupTransactionsByDay(entries: readonly TransactionEntry[]): TransactionDay[] {
  const days: TransactionDay[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }
  return days;
}

/** Số dòng, tổng tiền ra và vào. */
export function sumTransactions(entries: readonly TransactionEntry[]): TransactionTotals {
  let out = 0;
  let incoming = 0;
  for (const entry of entries) {
    if (entry.kind === 'expense') out += entry.expense.a;
    else if (entry.row.tone === 'owe') out += entry.row.amt;
    else if (entry.row.tone === 'get') incoming += entry.row.amt;
  }
  return { count: entries.length, out, in: incoming };
}

/** Chuẩn hoá để so khớp tìm kiếm: chữ thường, bỏ dấu tiếng Việt. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();

/** Chuỗi để tìm trong một giao dịch: nội dung / ghi chú, tên người, số tiền (chữ số liền, ví dụ 50000) và ngày hiện (dd/mm). */
function searchTextOf(entry: TransactionEntry): string {
  if (entry.kind === 'expense') return `${entry.expense.n ?? ''} ${entry.expense.a} ${entry.date}`;
  const row = entry.row;
  return `${row.title} ${row.detail} ${row.note} ${row.from} ${row.to} ${row.amt} ${entry.date}`;
}

/**
 * Tìm giao dịch theo từ khoá (không phân biệt hoa thường và dấu): mọi từ trong `query` đều phải có mặt trong nội dung, tên người, số tiền hoặc ngày của giao dịch. Số tiền gõ có dấu chấm / phẩy
 * ("50.000") vẫn khớp số 50000. Từ khoá trống thì trả nguyên danh sách.
 */
export function searchTransactions(entries: readonly TransactionEntry[], query: string): TransactionEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((entry) => {
    const text = fold(searchTextOf(entry));
    return words.every((word) => text.includes(word) || (/^[\d.,]+$/.test(word) && text.includes(word.replace(/[.,]/g, ''))));
  });
}
