/**
 * Lịch sử Chia bill (hàm thuần): lọc theo kỳ, gom theo ngày và dựng lại form từ một bill đã lưu để sửa.
 * Chuyển từ `ut()` và `Pn()` của `mod-c` trong PWA. Tiền là NGHÌN đồng.
 */

import { BILL_OWNER_NAME, DEFAULT_BILL_TITLE, computeSplit, fixedOf, weightOf } from '@/domain/bills';
import { emptyPerson, type FormPerson } from '@/domain/billForm';
import { isInPeriod, resolveCategory } from '@/domain/expenses';
import { formatNghinInput, nghinToVnd } from '@/domain/money';
import type { Bill } from '@/types/bill';
import type { DateStr, ExpenseSettings, Period } from '@/types/expense';
import type { Nghin } from '@/types/money';

export interface BillDay {
  date: DateStr;
  bills: Bill[];
  /** Tổng bill của ngày (nghìn đồng). */
  total: Nghin;
}

export interface BillHistory {
  days: BillDay[];
  count: number;
  /** Tổng số tiền đã chi của mọi bill trong kỳ (nghìn đồng) — số trên tiêu đề "Chia bill". */
  totalPaid: Nghin;
}

/** Tổng một bill = tổng số tiền mọi người đã chi. */
export function billTotal(bill: Pick<Bill, 'people'>): Nghin {
  return computeSplit(bill.people).total;
}

/** Bill trong kỳ, mới nhất trước (cùng ngày thì tạo sau trước), gom theo ngày. */
export function buildBillHistory(bills: readonly Bill[], period: Period): BillHistory {
  const inPeriod = bills.filter((bill) => isInPeriod(bill.date, period));
  const sorted = [...inPeriod].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const days: BillDay[] = [];
  for (const bill of sorted) {
    const last = days[days.length - 1];
    const total = billTotal(bill);
    if (last && last.date === bill.date) {
      last.bills.push(bill);
      last.total += total;
    } else {
      days.push({ date: bill.date, bills: [bill], total });
    }
  }
  return { days, count: sorted.length, totalPaid: sorted.reduce((sum, bill) => sum + billTotal(bill), 0) };
}

/**
 * Giữ các bill thuộc một mục chi (`'all'` giữ tất cả). Mục chi của bill được quy về mục hiện có (mục đã xoá thì về "Khác") bằng
 * `resolveCategory`, cùng quy tắc với chi tiêu cá nhân. Chỉ lọc hiển thị: không sửa bill.
 */
export function filterBillsByCategory(bills: readonly Bill[], settings: ExpenseSettings, categoryId: string | 'all'): Bill[] {
  if (categoryId === 'all') return [...bills];
  return bills.filter((bill) => resolveCategory(settings, bill.cat).id === categoryId);
}

/** Bill trong kỳ dưới dạng một danh sách phẳng, cùng thứ tự với lịch sử (mới nhất trước); dùng cho mục "Chi tiết" ở Tổng quan. */
export function billsInPeriod(bills: readonly Bill[], period: Period): Bill[] {
  return buildBillHistory(bills, period).days.flatMap((day) => day.bills);
}

/** Tìm bill theo MÃ (`id`) — không bao giờ theo tên, ngày hay số tiền (có thể trùng nhau). Không thấy thì `null`. */
export function findBillById(bills: readonly Bill[], id: string | null | undefined): Bill | null {
  if (!id) return null;
  return bills.find((bill) => bill.id === id) ?? null;
}

export interface BillFormState {
  title: string;
  date: DateStr;
  cat: string;
  rows: FormPerson[];
}

/**
 * Dựng form từ bill đã lưu để sửa (`Pn` của PWA): "Không tên" thành ô trống; người đầu là "Tôi"
 * (đưa lên đầu nếu đang ở chỗ khác; nếu bill không có "Tôi" thì thêm dòng "Tôi" hệ số 0 để không bị chia phần).
 * Số tiền đã chi giữ nguyên số đã lưu.
 */
export function formFromBill(bill: Pick<Bill, 'title' | 'date' | 'cat' | 'people'>): BillFormState {
  const rows: FormPerson[] = bill.people.map((person) => {
    const fixed = fixedOf(person);
    const weight = weightOf(person);
    return {
      name: String(person.name ?? ''),
      paidText: +person.paid ? String(+person.paid) : '',
      weightText: fixed === null && weight !== 1 ? String(weight).replace('.', ',') : '',
      fixedText: fixed === null ? '' : formatNghinInput(nghinToVnd(fixed)),
    };
  });
  const meIndex = rows.findIndex((row) => row.name === BILL_OWNER_NAME);
  if (meIndex > 0) rows.unshift(rows.splice(meIndex, 1)[0]);
  else if (meIndex < 0) rows.unshift({ ...emptyPerson(BILL_OWNER_NAME), weightText: '0' });
  return { title: bill.title === DEFAULT_BILL_TITLE ? '' : bill.title || '', date: bill.date, cat: bill.cat || 'other', rows };
}

// ───────────────────────── Khung Chia bill ở Tổng quan ─────────────────────────

/** Khung hiện tối đa 3 người; nhiều hơn thì có "Xem thêm N người" / "Thu gọn". */
export const OVERVIEW_BILL_PEOPLE_LIMIT = 3;

export interface BillSpenderRow {
  name: string;
  /** Tổng số tiền người này đã chi trong kỳ (nghìn đồng). */
  amount: Nghin;
  /** Độ dài thanh so với người chi nhiều nhất, từ 2 đến 100 (%), làm tròn 1 chữ số thập phân. */
  percent: number;
}

export interface BillOverviewCard {
  count: number;
  /** Tổng bill trong kỳ (nghìn đồng). */
  total: Nghin;
  rows: BillSpenderRow[];
  /** Số người chưa hiện (nút "Xem thêm N người"). */
  hidden: number;
  /** Đang hiện tất cả mà có hơn 3 người (nút "Thu gọn"). */
  canCollapse: boolean;
}

/**
 * Khung "Chia bill" ở Tổng quan (hàm `an()` của PWA): số bill và tổng bill trong kỳ, rồi những người đã chi tiền
 * theo thứ tự chi nhiều nhất. Người đầu danh sách của mỗi bill và người tên đúng "Tôi" gộp thành "Tôi";
 * người chưa chi đồng nào hoặc không có tên thì bỏ qua.
 */
export function buildBillOverviewCard(bills: readonly Bill[], period: Period, showAll: boolean): BillOverviewCard {
  const inPeriod = bills.filter((bill) => isInPeriod(bill.date, period));
  const paidBy = new Map<string, number>();
  for (const bill of inPeriod) {
    bill.people.forEach((person, index) => {
      const paid = +person.paid || 0;
      if (paid <= 0) return;
      const name = index === 0 || person.name === BILL_OWNER_NAME ? BILL_OWNER_NAME : String(person.name || '').trim();
      if (name) paidBy.set(name, (paidBy.get(name) || 0) + paid);
    });
  }
  const sorted = [...paidBy.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  const max = sorted.length ? sorted[0].amount : 0;
  const overflow = sorted.length > OVERVIEW_BILL_PEOPLE_LIMIT;
  const shown = overflow && !showAll ? sorted.slice(0, OVERVIEW_BILL_PEOPLE_LIMIT) : sorted;
  return {
    count: inPeriod.length,
    total: inPeriod.reduce((sum, bill) => sum + billTotal(bill), 0),
    rows: shown.map((row) => ({ ...row, percent: max ? Math.round(Math.max(2, (row.amount / max) * 100) * 10) / 10 : 0 })),
    hidden: sorted.length - shown.length,
    canCollapse: overflow && showAll,
  };
}
