/**
 * Form chuyển tiền / trả bill và lịch sử khoản trả (hàm thuần). Chuyển từ `At`, `J`, `Te`, `q`, `me` của `mod-c` trong PWA.
 * Tiền là ĐỒNG.
 */

import { BILL_OWNER_NAME } from '@/domain/bills';
import { formatVndInput, maskVndInput, parseVndInput, roundVnd } from '@/domain/money';
import { isInPeriod } from '@/domain/expenses';
import { payClass } from '@/domain/ledger';
import type { Bill } from '@/types/bill';
import type { DateStr, Period } from '@/types/expense';
import type { Vnd } from '@/types/money';
import type { Pay } from '@/types/pay';

const isMe = (name: unknown): boolean => String(name || '') === BILL_OWNER_NAME;
const clean = (name: unknown): string => String(name || '').trim();

// ───────────────────────── Ô chọn người ─────────────────────────

/**
 * Các lựa chọn người ở hai ô "từ" và "đến" (`At`): "Tôi" rồi mọi tên đã xuất hiện trong bill, khoản trả và Danh sách người
 * (bỏ "Tôi", bỏ trùng đúng chữ, xếp theo thứ tự chữ).
 */
export function payNameOptions(bills: readonly Bill[], pays: readonly Pay[], people: readonly string[]): string[] {
  const names = new Set<string>();
  const add = (name: unknown) => {
    const value = clean(name);
    if (value && !isMe(value)) names.add(value);
  };
  for (const bill of bills) for (const person of bill.people) add(person.name);
  for (const pay of pays) {
    add(pay.from);
    add(pay.to);
  }
  for (const person of people) add(person);
  return [BILL_OWNER_NAME, ...[...names].sort()];
}

/** Lựa chọn của ô "đến": mọi người trừ người đang chọn ở ô "từ". */
export const whoOptions = (options: readonly string[], from: string): string[] => options.filter((option) => option !== from);

// ───────────────────────── Nhập liệu ─────────────────────────

export type PayType = 'bill' | 'vay';

/** Loại hiển thị của một khoản đã lưu (`Mt = nxCls(l) === 'bill' ? 'bill' : 'vay'`). */
export function payTypeOf(pay: Pick<Pay, 'kind' | 'item'>): PayType {
  return payClass(pay) === 'bill' ? 'bill' : 'vay';
}

/** Loại lưu của lựa chọn trên form: Trả bill → 'billpay', Chuyển tiền → 'vay'. */
export const payKindFor = (type: PayType): 'billpay' | 'vay' => (type === 'bill' ? 'billpay' : 'vay');

/** Ô số tiền: chỉ chữ số (ĐỒNG), tối đa 9 chữ số. */
export const maskPayAmount = (text: string): string => maskVndInput(text, 9);

/** Số tiền (ĐỒNG) từ chữ trong ô; trống hoặc không hợp lệ là 0. */
export function parsePayAmount(text: string): Vnd {
  return parseVndInput(text);
}

/** Số tiền (ĐỒNG) -> chữ trong ô nhập (chỉ chữ số). */
export function formatPayAmount(amount: Vnd): string {
  return formatVndInput(amount);
}

/** Được phép ghi nhận: đã chọn người nhận và số tiền > 0 (`J`). */
export const canRecordPay = (who: string, amount: Vnd): boolean => !!who && amount > 0;

export interface PayFormState {
  date: DateStr;
  note: string;
  from: string;
  to: string;
  amountText: string;
  type: PayType;
}

/** Dựng form từ khoản đã lưu để sửa (`Te`); loại do khoản đó quyết định, chưa phải lựa chọn của người dùng. */
export function formFromPay(pay: Pick<Pay, 'date' | 'note' | 'from' | 'to' | 'amt' | 'kind' | 'item'>): PayFormState {
  return { date: pay.date, note: pay.note || '', from: pay.from, to: pay.to, amountText: formatPayAmount(pay.amt), type: payTypeOf(pay) };
}

// ───────────────────────── Nhãn ─────────────────────────

/** Tiêu đề và dòng phụ của một khoản trả trong danh sách (`me`), kể cả nhóm thanh toán bill. */
export function payLabel(pay: Pay & { kind?: string; groupBills?: string[] }, bills: readonly Bill[]): [string, string] {
  if (pay.kind === 'grp') return ['Thanh toán bill', (pay.groupBills ?? []).slice().reverse().join(', ')];
  const titleOf = (id: string) => {
    const bill = bills.find((b) => b.id === id);
    return bill ? bill.title || 'Không tên' : 'bill đã xoá';
  };
  if (pay.lbl) return [pay.lbl, (pay.bills ?? []).map(titleOf).join(', ')];
  const cls = payClass(pay);
  if (cls === 'bt') return ['Gộp nợ', ''];
  if (cls === 'bill') {
    const bill = pay.bill ? bills.find((b) => b.id === pay.bill) : null;
    const parts = bill ? String(bill.date).split('-') : [];
    return ['Trả bill', bill ? `${bill.title || 'Không tên'} (${parts.length === 3 ? `${parts[2]}/${parts[1]}` : bill.date})` : ''];
  }
  return ['Chuyển tiền', ''];
}

// ───────────────────────── Lịch sử khoản trả ─────────────────────────

/** Một dòng của danh sách: khoản đơn hoặc nhóm nhiều khoản trả bill giữa hai người khác "Tôi". */
export interface PayRow {
  /** Mã để mở sửa: với nhóm là nhiều mã. */
  ids: string[];
  id: string;
  from: string;
  to: string;
  amt: Vnd;
  date: DateStr;
  group: boolean;
  /** Tiêu đề và dòng phụ (`me`). */
  title: string;
  detail: string;
  /** Ghi chú hiển thị (bỏ "Đối soát" và "Trả nợ"). */
  note: string;
  tone: 'owe' | 'get' | 'mid';
  /** Khoản gốc (với nhóm là khoản đầu). */
  pay: Pay;
}

export interface PayDay {
  date: DateStr;
  rows: PayRow[];
}

export interface PayHistory {
  days: PayDay[];
  count: number;
  /** Tổng tiền vào (tôi nhận) và ra (tôi trả) trong kỳ, không kể gộp nợ. */
  totalIn: Vnd;
  totalOut: Vnd;
}

const isBillish = (pay: Pay): boolean => pay.kind === 'bill' || pay.kind === 'billpay' || !!pay.bills || !!pay.bill || !!pay.lbl;

/**
 * Danh sách khoản trả trong kỳ (`q()`): bỏ gộp nợ (`bt`), mới nhất trước (cùng ngày: tạo sau trước), gom theo ngày.
 * Trong một ngày, các khoản trả bill giữa hai người đều khác "Tôi" và cùng cặp (từ, đến) được gom thành MỘT dòng cộng tiền;
 * nhóm chỉ có một khoản thì hiện như khoản đơn.
 */
export function buildPayHistory(pays: readonly Pay[], bills: readonly Bill[], period: Period): PayHistory {
  const inPeriod = pays.filter((pay) => isInPeriod(pay.date, period) && pay.kind !== 'bt');
  const sorted = [...inPeriod].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  const dayMap = new Map<DateStr, Pay[]>();
  for (const pay of sorted) {
    const list = dayMap.get(pay.date);
    if (list) list.push(pay);
    else dayMap.set(pay.date, [pay]);
  }

  const days: PayDay[] = [];
  for (const [date, list] of dayMap) {
    const rows: PayRow[] = [];
    const groups = new Map<string, { ids: string[]; first: Pay; amt: number; bills: string[]; index: number }>();
    for (const pay of list) {
      if (!isMe(pay.from) && !isMe(pay.to) && isBillish(pay)) {
        const key = `${clean(pay.from)}\u0000${clean(pay.to)}`;
        let group = groups.get(key);
        if (!group) {
          group = { ids: [], first: pay, amt: 0, bills: [], index: rows.length };
          groups.set(key, group);
          rows.push(null as never); // giữ chỗ để đúng thứ tự xuất hiện
        }
        group.ids.push(pay.id);
        group.amt = roundVnd(group.amt + (+pay.amt || 0));
        for (const id of pay.bills ?? (pay.bill ? [pay.bill] : [])) {
          const bill = bills.find((b) => b.id === id);
          const title = bill ? bill.title || 'Không tên' : 'bill đã xoá';
          if (!group.bills.includes(title)) group.bills.push(title);
        }
      } else {
        rows.push(rowOf([pay.id], pay, pay.amt, false, bills, []));
      }
    }
    for (const group of groups.values()) {
      rows[group.index] = group.ids.length === 1 ? rowOf(group.ids, group.first, group.first.amt, false, bills, []) : rowOf(group.ids, group.first, group.amt, true, bills, group.bills);
    }
    days.push({ date, rows });
  }

  const real = inPeriod;
  return {
    days,
    count: real.length,
    totalIn: real.filter((pay) => isMe(pay.to)).reduce((sum, pay) => sum + (+pay.amt || 0), 0),
    totalOut: real.filter((pay) => isMe(pay.from)).reduce((sum, pay) => sum + (+pay.amt || 0), 0),
  };
}

function rowOf(ids: string[], pay: Pay, amt: Vnd, group: boolean, bills: readonly Bill[], groupBills: string[]): PayRow {
  const [title, detail] = payLabel(group ? { ...pay, kind: 'grp', groupBills } : pay, bills);
  const rawNote = pay.note && pay.note !== 'Đối soát' && pay.note !== 'Trả nợ' ? pay.note : '';
  return {
    ids,
    id: ids[0],
    from: pay.from,
    to: pay.to,
    amt,
    date: pay.date,
    group,
    title,
    detail,
    note: group ? '' : rawNote,
    tone: isMe(pay.from) ? 'owe' : isMe(pay.to) ? 'get' : 'mid',
    pay,
  };
}

/** Dòng phụ dưới nhãn loại: chi tiết (tên bill…) và ghi chú, cách nhau bằng " · ". */
export const payRowSubtitle = (row: Pick<PayRow, 'detail' | 'note'>): string => [row.detail, row.note].filter(Boolean).join(' · ');
