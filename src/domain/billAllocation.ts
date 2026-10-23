/**
 * PHÂN BỔ khoản trả sổ bill vào từng khoản "cần chuyển" của từng bill (hàm thuần, chỉ ĐỌC dữ liệu). Tiền là ĐỒNG.
 *
 * Đây là NƠI DUY NHẤT cài đặt quy tắc "trả bill cũ trước": mỗi khoản trả thuộc sổ bill (kể cả gộp nợ sổ bill) từ A cho B trừ dần vào các khoản
 * "A phải chuyển cho B" của các bill, theo thứ tự thời gian (ngày, rồi `createdAt`; cùng thời điểm thì bill trước khoản trả), bill cũ trước.
 * Áp cho MỌI cặp người (không chỉ cặp có "Tôi"); trả dư thì phần dư không thuộc khoản chuyển nào. Không lưu gì: tính lại mỗi lần.
 *
 * Ba nơi dùng kết quả này (mỗi nơi chỉ là một cách nhìn):
 * - `billPayment.billTransferStatuses`: trạng thái từng khoản chuyển / từng bill;
 * - `billPerson.personBillRows`: các bill của một người với "Tôi";
 * - `payExpenses.allocatePayments`: khoản chi cá nhân sinh từ khoản "Tôi" trả.
 */

import { computeSplit } from '@/domain/bills';
import { mergeLedger, payClass } from '@/domain/ledger';
import { roundVnd } from '@/domain/money';
import type { Bill } from '@/types/bill';
import type { Vnd } from '@/types/money';
import type { Pay } from '@/types/pay';

const clean = (name: unknown): string => String(name || '').trim();

/** Khóa của một cặp có chiều: `from` phải chuyển cho `to`. */
export const transferPairKey = (from: string, to: string): string => `${from}\u0001${to}`;

/** Một lần trừ của một khoản trả vào một khoản chuyển. */
export interface BillPaymentTake {
  slot: BillTransferSlot;
  amount: Vnd;
}

/** Một khoản "cần chuyển" của một bill (đúng thứ tự `computeSplit(...).transfers`) cùng số đã được trừ. */
export interface BillTransferSlot {
  bill: Bill;
  from: string;
  to: string;
  /** Tổng số cần chuyển theo bill. */
  amount: Vnd;
  /** Còn lại sau khi đã trừ mọi khoản trả (CHƯA áp ngưỡng `DEBT_ZERO`; nơi dùng tự quyết). */
  left: Vnd;
}

export interface BillAllocation {
  /** Khoá: mã bill. */
  byBill: Map<string, BillTransferSlot[]>;
  /** Mỗi khoản trả (đúng đối tượng truyền vào) đã trừ vào những khoản chuyển nào, theo thứ tự bill cũ → mới. Khoản không trừ được gì thì không có mặt. */
  byPay: Map<Pay, BillPaymentTake[]>;
}

export function allocateBillPayments(bills: readonly Bill[], pays: readonly Pay[]): BillAllocation {
  type Item = { d: string; c: number; bill?: Bill; pay?: Pay };
  const items: Item[] = [];
  for (const bill of bills) items.push({ d: String(bill.date), c: bill.createdAt || 0, bill });
  for (const pay of pays) {
    if (!((+pay.amt || 0) > 0)) continue;
    const cls = payClass(pay);
    if ((cls === 'bt' ? mergeLedger(pay) : cls) !== 'bill') continue;
    items.push({ d: String(pay.date), c: pay.createdAt || 0, pay });
  }
  items.sort((a, b) => a.d.localeCompare(b.d) || a.c - b.c); // ổn định: cùng ngày và cùng thời điểm thì bill trước khoản trả, như `debtEvents`

  const byBill = new Map<string, BillTransferSlot[]>();
  const byPay = new Map<Pay, BillPaymentTake[]>();
  const queues = new Map<string, BillTransferSlot[]>();
  for (const item of items) {
    if (item.bill) {
      const list: BillTransferSlot[] = [];
      for (const transfer of computeSplit(item.bill.people).transfers) {
        const from = clean(transfer.from);
        const to = clean(transfer.to);
        const slot: BillTransferSlot = { bill: item.bill, from, to, amount: transfer.amt, left: roundVnd(transfer.amt) };
        list.push(slot);
        const key = transferPairKey(from, to);
        const queue = queues.get(key) ?? [];
        queue.push(slot);
        queues.set(key, queue);
      }
      byBill.set(item.bill.id, list);
      continue;
    }
    const pay = item.pay!;
    let amount = +pay.amt || 0;
    const takes: BillPaymentTake[] = [];
    for (const slot of queues.get(transferPairKey(clean(pay.from), clean(pay.to))) ?? []) {
      if (amount <= 0) break;
      const take = Math.min(slot.left, amount);
      if (take > 0) takes.push({ slot, amount: take });
      slot.left = roundVnd(slot.left - take);
      amount = roundVnd(amount - take);
    }
    if (takes.length) byPay.set(pay, takes);
  }
  return { byBill, byPay };
}
