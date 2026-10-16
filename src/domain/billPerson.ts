/**
 * "Chi tiết" của khung Chia bill ở Tổng quan, theo từng người (hàm thuần). Tiền là NGHÌN đồng.
 * - Cấp 1: mỗi người một số tiền còn phải thanh toán của các bill trong kỳ (`personBillSummary`).
 * - Cấp 2: các bill của một người trong kỳ, mỗi bill có số tiền theo bill, đã thanh toán, còn phải thanh toán (`personBillRows`).
 * - Thanh toán: kiểm tra số tiền nhập (`checkPairPayment`).
 *
 * Khác "số dư công nợ" (`personLedger`: toàn thời gian, tách sổ vay / bill, có cả khoản vay): ở đây chỉ nói về BILL.
 * Đã thanh toán của từng bill dùng đúng quy tắc phân bổ sẵn có của app (`allocatePayments`): mỗi khoản trả sổ bill (kể cả gộp nợ)
 * trừ dần vào các bill còn nợ của người đó theo thứ tự thời gian, bill cũ trước; trả dư thì phần dư không thuộc bill nào.
 * Số của kỳ đang xem là tổng còn lại của CÁC BILL TRONG KỲ, nên không phụ thuộc ngày ghi khoản trả.
 */

import { BILL_OWNER_NAME } from '@/domain/bills';
import { formatMoney } from '@/domain/billForm';
import { toneOf, type Tone } from '@/domain/debtDetail';
import { isInPeriod } from '@/domain/expenses';
import { DEBT_ZERO, MIN_PAY_AMOUNT, debtEvents, r3, type PayDraft } from '@/domain/ledger';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Nghin } from '@/types/money';
import type { Pay } from '@/types/pay';

const clean = (name: unknown): string => String(name || '').trim();

/** Chiều nợ của một bill với một người: -1 tôi nợ họ, 1 họ nợ tôi. */
type Direction = -1 | 1;

interface Slot {
  bill: Bill;
  dir: Direction;
  size: Nghin;
  left: Nghin;
}

/** Phân bổ các khoản trả sổ bill vào từng bill của MỘT người (mọi thời gian), theo `allocatePayments`. Khoá: mã bill. */
function allocateForPerson(bills: readonly Bill[], pays: readonly Pay[], who: string): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  const queues: Record<Direction, Slot[]> = { [-1]: [], [1]: [] };
  for (const event of debtEvents(bills, pays)) {
    if (event.led !== 'bill' || event.who !== who) continue;
    if (event.k === 'bill') {
      if (!event.bill) continue;
      const dir: Direction = event.v < 0 ? -1 : 1;
      const slot: Slot = { bill: event.bill, dir, size: r3(Math.abs(event.v)), left: r3(Math.abs(event.v)) };
      slots.set(event.bill.id, slot);
      queues[dir].push(slot);
      continue;
    }
    // Khoản trả / gộp nợ: tôi trả họ (v > 0) giảm nợ của tôi; họ trả tôi (v < 0) giảm nợ của họ.
    let amount = Math.abs(event.v);
    for (const slot of queues[event.v > 0 ? -1 : 1]) {
      if (amount <= 0) break;
      const take = Math.min(slot.left, amount);
      slot.left = r3(slot.left - take);
      amount = r3(amount - take);
    }
  }
  return slots;
}

export interface PersonBillRow {
  /** Mã bill (dùng để mở chi tiết bill; không dùng tên, ngày hay số tiền). */
  id: string;
  title: string;
  date: string;
  /** Số tiền theo bill giữa tôi và người này (dương: họ nợ tôi, âm: tôi nợ họ). */
  amount: Nghin;
  /** Đã thanh toán (dương, cùng chiều với bill). */
  paid: Nghin;
  /** Còn phải thanh toán của riêng bill này (dương). */
  remaining: Nghin;
  dir: Direction;
}

export interface PersonBills {
  rows: PersonBillRow[];
  /** Tổng còn phải thanh toán có dấu (dương: họ nợ tôi, âm: tôi nợ họ) và bản độ lớn. */
  net: Nghin;
  /** Số còn phải thanh toán (≥ 0) theo chiều nợ chính. */
  remaining: Nghin;
  /** Người trả / người nhận của khoản còn phải thanh toán. */
  from: string;
  to: string;
}

/** Cấp 2: các bill của `person` trong kỳ, từ bill cũ đến mới (cũng là thứ tự phân bổ thanh toán). */
export function personBillRows(bills: readonly Bill[], pays: readonly Pay[], person: string, period: Period): PersonBills {
  const who = clean(person);
  const slots = allocateForPerson(bills, pays, who);
  const rows: PersonBillRow[] = [];
  for (const slot of slots.values()) {
    if (!isInPeriod(slot.bill.date, period)) continue;
    rows.push({
      id: slot.bill.id,
      title: slot.bill.title || 'Không tên',
      date: String(slot.bill.date),
      amount: slot.dir * slot.size,
      paid: r3(slot.size - slot.left),
      remaining: slot.left,
      dir: slot.dir,
    });
  }
  const dateOf = new Map(bills.map((bill) => [bill.id, bill.createdAt || 0]));
  rows.sort((a, b) => a.date.localeCompare(b.date) || (dateOf.get(a.id) ?? 0) - (dateOf.get(b.id) ?? 0));
  const net = r3(rows.reduce((sum, row) => sum + row.dir * row.remaining, 0));
  const iOwe = net < 0;
  return { rows, net, remaining: Math.abs(net), from: iOwe ? BILL_OWNER_NAME : who, to: iOwe ? who : BILL_OWNER_NAME };
}

export interface PersonBillSummary {
  name: string;
  /** Còn phải thanh toán của các bill trong kỳ (dương: họ nợ tôi, âm: tôi nợ họ). */
  amount: Nghin;
  tone: Tone;
}

/** Cấp 1: mỗi người có bill chưa thanh toán xong trong kỳ một số tiền; người đã thanh toán xong mọi bill của kỳ thì không có. */
export function personBillSummary(bills: readonly Bill[], pays: readonly Pay[], period: Period): PersonBillSummary[] {
  const people = new Set<string>();
  for (const event of debtEvents(bills, [])) {
    if (event.led === 'bill' && event.k === 'bill' && event.bill && isInPeriod(event.bill.date, period)) people.add(event.who);
  }
  const result: PersonBillSummary[] = [];
  for (const name of people) {
    const { rows, net } = personBillRows(bills, pays, name, period);
    if (!rows.some((row) => row.remaining >= DEBT_ZERO)) continue;
    result.push({ name, amount: net, tone: toneOf(net) });
  }
  return result.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.name.localeCompare(b.name));
}

export type PairPaymentCheck = { ok: true; amount: Nghin } | { ok: false; message: string };

/** Số tiền thanh toán nhập vào phải > 0 và không vượt số còn phải thanh toán (không ghi nhận tiền dư ở màn này). */
export function checkPairPayment(remaining: Nghin, amount: Nghin): PairPaymentCheck {
  const value = r3(Number(amount));
  if (!(value > MIN_PAY_AMOUNT)) return { ok: false, message: 'Nhập số tiền lớn hơn 0.' };
  if (remaining < DEBT_ZERO) return { ok: false, message: 'Không còn khoản nào phải thanh toán.' };
  if (value > r3(remaining) + MIN_PAY_AMOUNT) return { ok: false, message: `Số tiền vượt quá số còn phải thanh toán (${formatMoney(remaining)}).` };
  return { ok: true, amount: Math.min(value, r3(remaining)) };
}

/** Bản nháp khoản trả (sổ bill) từ người trả sang người nhận cho số tiền đã kiểm tra; null nếu không hợp lệ. */
export function pairAmountDraft(net: { from: string; to: string; remaining: Nghin }, amount: Nghin): PayDraft | null {
  const check = checkPairPayment(net.remaining, amount);
  if (!check.ok) return null;
  return { kind: 'billpay', from: net.from, to: net.to, amt: check.amount };
}
