/**
 * Lịch sử Chia bill (hàm thuần): lọc theo kỳ, gom theo ngày và dựng lại form từ một bill đã lưu để sửa.
 * Chuyển từ `ut()` và `Pn()` của `mod-c` trong PWA. Tiền là NGHÌN đồng.
 */

import { BILL_OWNER_NAME, DEFAULT_BILL_TITLE, computeSplit, fixedOf, weightOf } from '@/domain/bills';
import { emptyPerson, type FormPerson } from '@/domain/billForm';
import { isInPeriod } from '@/domain/expenses';
import { formatNghinInput, nghinToVnd } from '@/domain/money';
import type { Bill } from '@/types/bill';
import type { DateStr, Period } from '@/types/expense';
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
