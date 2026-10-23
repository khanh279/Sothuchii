/**
 * Mô hình hiển thị màn "Chi tiết nợ" (hàm thuần): chi tiết với MỘT người (hai ngăn Nợ vay / Nợ bill, thanh toán, gộp nợ,
 * lịch sử gộp) và chi tiết một CẶP người trong kỳ. Chuyển từ `Q()`, `nxCt()`, `nxGroupBill()`, `nxDays()` của `mod-c` trong PWA.
 * Tiền là ĐỒNG.
 */

import { isInPeriod } from '@/domain/expenses';
import { isOwnerName } from '@/domain/funds';
import { DEBT_ZERO, canMerge, debtEvents, isNearZero, ledgerItems, mergeAmount, mergeHistory, pairNet, personLedger, type LedgerItem, type MergeRecord } from '@/domain/ledger';
import type { Bill } from '@/types/bill';
import type { DateStr, Period } from '@/types/expense';
import type { Vnd } from '@/types/money';
import type { Ledger, Pay } from '@/types/pay';
import { roundVnd } from '@/domain/money';

export type Tone = 'get' | 'owe' | 'mid';

/** Màu theo dấu (`nxCl`): dương = nhận (xanh), âm = trả (đỏ), gần 0 = trung tính. */
export const toneOf = (value: number): Tone => (value > 0.5 ? 'get' : value < -0.5 ? 'owe' : 'mid');

export interface DebtRow extends LedgerItem {
  tone: Tone;
}

export interface DayGroup {
  date: DateStr;
  net: Vnd;
  tone: Tone;
  rows: DebtRow[];
}

export interface MonthGroup {
  /** 'YYYY-MM'. */
  month: string;
  net: Vnd;
  tone: Tone;
  count: number;
  days: DayGroup[];
}

/** Xem theo từng ngày khi kỳ nằm trong một tháng (`nxMonthMode`); ngược lại gom theo tháng. */
export function isMonthMode(period: Period): boolean {
  if (period.mode === 'month') return true;
  if (period.mode === 'custom') return period.from.slice(0, 7) === period.to.slice(0, 7);
  return false;
}

/** Gom các dòng theo ngày (`nxDays`). Dòng có `tone` cố định (chi tiết cặp) giữ nguyên; ngày có dòng trung tính thì cả ngày trung tính. */
export function groupDebtRowsByDay(rows: readonly DebtRow[], fixedTone = false): DayGroup[] {
  const order: DateStr[] = [];
  const map = new Map<DateStr, DebtRow[]>();
  for (const row of rows) {
    if (!map.has(row.d)) {
      map.set(row.d, []);
      order.push(row.d);
    }
    map.get(row.d)?.push(row);
  }
  return order.map((date) => {
    const list = map.get(date) ?? [];
    const net = roundVnd(list.reduce((sum, row) => sum + row.v, 0));
    return { date, net, tone: fixedTone ? (list[0].tone === 'mid' ? 'mid' : toneOf(net)) : toneOf(net), rows: list };
  });
}

/** Gom các dòng theo tháng (`nxGroupBill` khi không ở chế độ tháng). */
export function groupDebtRowsByMonth(rows: readonly DebtRow[], fixedTone = false): MonthGroup[] {
  const order: string[] = [];
  const map = new Map<string, DebtRow[]>();
  for (const row of rows) {
    const key = row.d.slice(0, 7);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)?.push(row);
  }
  return order.map((month) => {
    const list = map.get(month) ?? [];
    const net = roundVnd(list.reduce((sum, row) => sum + row.v, 0));
    return { month, net, tone: fixedTone && list.some((row) => row.tone === 'mid') ? 'mid' : toneOf(net), count: list.length, days: groupDebtRowsByDay(list, fixedTone) };
  });
}

/** Dòng phụ dưới tên ngăn (`nxSubOf`). */
export function ledgerSubtitle(balance: Vnd, name: string): string {
  return isNearZero(balance) ? 'Đã thanh toán xong' : balance > 0 ? `${name} nợ tôi` : `Tôi nợ ${name}`;
}

export interface PayAction {
  ledger: Ledger;
  /** "Nợ vay" / "Nợ bill". */
  label: string;
  balance: Vnd;
  /** Dòng chữ: "<họ> nợ tôi" hoặc "Tôi nợ <họ>". */
  owes: string;
}

export interface DebtDetail {
  name: string;
  loan: Vnd;
  bill: Vnd;
  /** Ngăn Nợ vay chỉ hiện khi số dư còn nợ (từ 50 đồng); sổ về 0 bị ẩn nhưng lịch sử vẫn nằm trong dữ liệu. Liệt kê MỌI dòng (không theo kỳ). */
  hasLoan: boolean;
  loanSubtitle: string;
  loanRows: DebtRow[];
  hasBill: boolean;
  billSubtitle: string;
  /** Tổng nợ bill trong kỳ; null khi kỳ là "Tất cả" (không hiện dòng tổng). */
  billPeriodTotal: Vnd | null;
  /** Bill trong kỳ: theo ngày (chế độ tháng) hoặc theo tháng. */
  monthMode: boolean;
  billDays: DayGroup[];
  billMonths: MonthGroup[];
  billEmpty: boolean;
  /** Không còn khoản nợ nào ở cả hai sổ → hiện "Không còn nợ". */
  settled: boolean;
  /** Hai sổ trái dấu (kể cả khi tổng bằng 0) → chỉ có "Gộp nợ", chưa có "Thanh toán". */
  canMerge: boolean;
  mergeAmount: Vnd;
  /** Hai sổ cùng dấu, hoặc chỉ một sổ còn nợ → có "Thanh toán". */
  canPay: boolean;
  /** Sổ còn nợ để thanh toán; rỗng khi hai sổ trái dấu (phải gộp nợ trước, không tự bù trừ). */
  payActions: PayAction[];
  history: MergeRecord[];
}

const toRows = (items: readonly LedgerItem[]): DebtRow[] => items.map((item) => ({ ...item, tone: toneOf(item.v) }));

/** Chi tiết nợ với MỘT người (`Q()`): số dư toàn thời gian ở hai sổ; danh sách bill chỉ trong kỳ đang xem. */
export function buildDebtDetail(
  bills: readonly Bill[],
  pays: readonly Pay[],
  name: string,
  period: Period,
  categoryName: (id: string) => string = () => '',
): DebtDetail {
  const ledger = personLedger(debtEvents(bills, pays), name);
  const who = ledger.name;
  const loanItems = ledgerItems(ledger.ev.loan, categoryName);
  const billItems = ledgerItems(ledger.ev.bill, categoryName);
  const inPeriod = billItems.filter((item) => isInPeriod(item.d, period));
  const monthMode = isMonthMode(period);
  const rows = toRows(inPeriod);
  const merge = { loan: ledger.loan, bill: ledger.bill };
  const label: Record<Ledger, string> = { loan: 'Nợ vay', bill: 'Nợ bill' };
  const mergeable = canMerge(merge);
  const payActions: PayAction[] = (['loan', 'bill'] as const)
    .filter((key) => !mergeable && !isNearZero(ledger[key]))
    .map((key) => ({ ledger: key, label: label[key], balance: ledger[key], owes: ledger[key] > 0 ? `${who} nợ tôi` : `Tôi nợ ${who}` }));
  return {
    name: who,
    loan: ledger.loan,
    bill: ledger.bill,
    hasLoan: !isNearZero(ledger.loan),
    loanSubtitle: ledgerSubtitle(ledger.loan, who),
    loanRows: toRows(loanItems),
    hasBill: !isNearZero(ledger.bill),
    billSubtitle: ledgerSubtitle(ledger.bill, who),
    billPeriodTotal: period.mode === 'all' ? null : roundVnd(inPeriod.reduce((sum, item) => sum + item.v, 0)),
    monthMode,
    billDays: monthMode ? groupDebtRowsByDay(rows) : [],
    billMonths: monthMode ? [] : groupDebtRowsByMonth(rows),
    billEmpty: inPeriod.length === 0,
    settled: isNearZero(ledger.loan) && isNearZero(ledger.bill),
    canMerge: mergeable,
    mergeAmount: mergeAmount(merge),
    canPay: payActions.length > 0,
    payActions,
    history: mergeHistory(pays, who),
  };
}

export interface PairDetail {
  /** Có dòng nào trong kỳ không. */
  empty: boolean;
  /** "Tôi nợ X" / "X nợ tôi" / "X nợ Y". */
  label: string;
  tone: Tone;
  /** Số tiền chênh lệch (luôn ≥ 0). */
  amount: Vnd;
  monthMode: boolean;
  days: DayGroup[];
  months: MonthGroup[];
  /** Có nút "Thanh toán toàn bộ" (chênh lệch từ 50 đồng). */
  canPay: boolean;
  /** Người còn lại khi một bên là "Tôi" (để gộp nợ); null nếu không liên quan đến tôi. */
  other: string | null;
  canMerge: boolean;
  mergeAmount: Vnd;
}

/** Chi tiết bill giữa hai người `x` và `z` trong kỳ (`nxCt`). */
export function buildPairDetail(
  bills: readonly Bill[],
  pays: readonly Pay[],
  x: string,
  z: string,
  period: Period,
  categoryName: (id: string) => string = () => '',
): PairDetail {
  const net = pairNet(bills, pays, x, z, period, categoryName);
  const monthMode = isMonthMode(period);
  const me = isOwnerName(x) || isOwnerName(z);
  const debtor = net.from;
  const creditor = net.to;
  const label = isOwnerName(debtor) ? `Tôi nợ ${creditor}` : isOwnerName(creditor) ? `${debtor} nợ tôi` : `${debtor} nợ ${creditor}`;
  const tone: Tone = isOwnerName(debtor) ? 'owe' : isOwnerName(creditor) ? 'get' : 'mid';
  const rows: DebtRow[] = net.items.map((item) => {
    const v = me ? (isOwnerName(z) ? item.s : -item.s) : debtor === x ? item.s : -item.s;
    return { d: item.d, v, t: item.t, s: item.x, tone: me ? toneOf(v) : 'mid' };
  });
  const other = isOwnerName(x) ? z : isOwnerName(z) ? x : null;
  const ledger = other ? personLedger(debtEvents(bills, pays), other) : null;
  return {
    empty: net.items.length === 0,
    label,
    tone,
    amount: net.amt,
    monthMode,
    days: monthMode ? groupDebtRowsByDay(rows, true) : [],
    months: monthMode ? [] : groupDebtRowsByMonth(rows, true),
    canPay: net.amt >= DEBT_ZERO,
    other,
    canMerge: ledger ? canMerge(ledger) : false,
    mergeAmount: ledger ? mergeAmount(ledger) : 0,
  };
}
