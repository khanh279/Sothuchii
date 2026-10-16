/**
 * Trạng thái thanh toán của từng khoản "Cần chuyển" của một bill và của cả bill (hàm thuần, chỉ ĐỌC dữ liệu). Tiền là NGHÌN đồng.
 *
 * Dùng đúng quy tắc phân bổ sẵn có của app (`allocatePayments` / `allocateForPerson` của `billPerson`): mỗi khoản trả thuộc sổ bill
 * (kể cả gộp nợ sổ bill) từ A cho B trừ dần vào các khoản "A phải chuyển cho B" của các bill, theo thứ tự thời gian, bill cũ trước.
 * Ở đây quy tắc đó được áp cho MỌI cặp người (không chỉ cặp có "Tôi"), nên kết quả của cặp có "Tôi" trùng với `personBillRows`.
 * Không ghi nhận / sửa bất cứ giao dịch nào; trả dư thì phần dư không thuộc khoản chuyển nào.
 */

import { computeSplit } from '@/domain/bills';
import { DEBT_ZERO, mergeLedger, payClass, r3 } from '@/domain/ledger';
import type { Bill } from '@/types/bill';
import type { Nghin } from '@/types/money';
import type { Pay } from '@/types/pay';

export type TransferPayState = 'paid' | 'unpaid' | 'partial';

export interface BillTransferStatus {
  from: string;
  to: string;
  /** Tổng số tiền cần chuyển theo bill. */
  amount: Nghin;
  /** Đã trả (đã phân bổ vào khoản chuyển này) và còn thiếu. */
  paid: Nghin;
  remaining: Nghin;
  state: TransferPayState;
}

const clean = (name: unknown): string => String(name || '').trim();
const pairKey = (from: string, to: string): string => `${from}\u0001${to}`;

interface Slot {
  status: BillTransferStatus;
  left: Nghin;
}

/** Trạng thái các khoản cần chuyển của MỌI bill (khoá: mã bill), mỗi khoản đúng thứ tự của `computeSplit(...).transfers`. */
export function billTransferStatuses(bills: readonly Bill[], pays: readonly Pay[]): Map<string, BillTransferStatus[]> {
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

  const result = new Map<string, BillTransferStatus[]>();
  const queues = new Map<string, Slot[]>();
  for (const item of items) {
    if (item.bill) {
      const list: BillTransferStatus[] = [];
      for (const transfer of computeSplit(item.bill.people).transfers) {
        const from = clean(transfer.from);
        const to = clean(transfer.to);
        const status: BillTransferStatus = { from, to, amount: transfer.amt, paid: 0, remaining: r3(transfer.amt), state: 'unpaid' };
        list.push(status);
        const key = pairKey(from, to);
        const queue = queues.get(key) ?? [];
        queue.push({ status, left: r3(transfer.amt) });
        queues.set(key, queue);
      }
      result.set(item.bill.id, list);
      continue;
    }
    const pay = item.pay!;
    let amount = +pay.amt || 0;
    for (const slot of queues.get(pairKey(clean(pay.from), clean(pay.to))) ?? []) {
      if (amount <= 0) break;
      const take = Math.min(slot.left, amount);
      slot.left = r3(slot.left - take);
      amount = r3(amount - take);
    }
  }

  for (const list of result.values()) {
    for (const status of list) {
      const slot = [...(queues.get(pairKey(status.from, status.to)) ?? [])].find((s) => s.status === status);
      const left = slot ? slot.left : status.remaining;
      status.remaining = left < DEBT_ZERO ? 0 : left;
      status.paid = r3(status.amount - status.remaining);
      status.state = status.remaining <= 0 ? 'paid' : status.paid < DEBT_ZERO ? 'unpaid' : 'partial';
    }
  }
  return result;
}

/**
 * Trạng thái chung của cả bill ở danh sách: "Đã thanh toán" chỉ khi MỌI khoản cần chuyển đã hoàn thành (bill không có khoản nào cần chuyển
 * — ví dụ chỉ một người hoặc mọi người đã cân bằng — không còn gì phải trả nên cũng là đã thanh toán); còn lại là "Chưa thanh toán",
 * kể cả khi mới thanh toán một phần.
 */
export function billSettled(statuses: readonly BillTransferStatus[] | undefined): boolean {
  return (statuses ?? []).every((status) => status.state === 'paid');
}

export const TRANSFER_STATE_LABEL: Record<TransferPayState, string> = {
  paid: 'Đã thanh toán',
  unpaid: 'Chưa thanh toán',
  partial: 'Thanh toán một phần',
};
