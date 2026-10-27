/**
 * Các khoản "Cần thanh toán" theo CẶP người của các bill trong kỳ (hàm thuần, chỉ ĐỌC dữ liệu). Tiền là ĐỒNG.
 *
 * Dùng lại trạng thái từng khoản chuyển của `billTransferStatuses` (đã áp quy tắc phân bổ sẵn có: mỗi khoản trả sổ bill từ A cho B
 * trừ dần vào các khoản "A phải chuyển cho B" theo thứ tự thời gian, bill cũ trước) nên số còn phải thanh toán phản ánh đúng các khoản trả
 * đã ghi nhận, kể cả thanh toán một phần. Phạm vi của một cặp là các bill NẰM TRONG kỳ có khoản chuyển giữa đúng hai người đó; khoản trả
 * có thể ghi ở bất kỳ ngày nào. Hai chiều của cùng một cặp (A → B và B → A) được bù trừ thành một số còn lại theo chiều thắng,
 * giống `personBillRows`. Không bù trừ nợ bill với nợ vay (chỉ xét sổ bill).
 */

import { billTransferStatuses } from '@/domain/billPayment';
import { DEBT_ZERO } from '@/domain/ledger';
import { isInPeriod } from '@/domain/expenses';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Vnd } from '@/types/money';
import type { Pay } from '@/types/pay';
import { roundVnd } from '@/domain/money';

export interface BillPair {
  /** Khoá ổn định của cặp (không phụ thuộc chiều), dùng làm khoá chọn / lọc. */
  key: string;
  /** Người trả → người nhận của số còn phải thanh toán. */
  from: string;
  to: string;
  /** Còn phải thanh toán (> 0, đã bù trừ hai chiều). */
  remaining: Vnd;
  /** Đã thanh toán một phần (đã có khoản trả được phân bổ nhưng chưa hết). */
  partial: boolean;
  /** Mã các bill trong kỳ có khoản chuyển giữa hai người này (phạm vi lọc lịch sử và thanh toán), từ cũ đến mới. */
  billIds: string[];
}

const clean = (name: unknown): string => String(name || '').trim();

/** Khoá không phụ thuộc chiều của cặp hai người. */
export function billPairKey(a: string, b: string): string {
  const x = clean(a);
  const y = clean(b);
  return x < y ? `${x}\u0001${y}` : `${y}\u0001${x}`;
}

interface Acc {
  low: string;
  high: string;
  /** Còn lại có dấu: dương theo chiều low → high. */
  remaining: number;
  paid: number;
  billIds: string[];
}

const byOldest = (a: Bill, b: Bill): number => String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0);

/** Các cặp còn khoản phải thanh toán trong kỳ, nhiều tiền nhất trước. Cặp đã thanh toán xong thì không có. */
export function buildBillPairs(bills: readonly Bill[], pays: readonly Pay[], period: Period): BillPair[] {
  return pairsOf(billTransferStatuses(bills, pays), bills.filter((bill) => isInPeriod(bill.date, period)).sort(byOldest));
}

/**
 * Như `buildBillPairs` nhưng cho MỘT TẬP bill được chọn (gộp bill), không theo kỳ. Trạng thái thanh toán vẫn tính trên TẤT CẢ bill và khoản trả
 * (đúng quy tắc phân bổ bill cũ trước), rồi chỉ cộng các khoản chuyển của những bill được chọn.
 */
export function buildBillPairsFor(bills: readonly Bill[], pays: readonly Pay[], ids: readonly string[]): BillPair[] {
  const picked = new Set(ids);
  return pairsOf(billTransferStatuses(bills, pays), bills.filter((bill) => picked.has(bill.id)).sort(byOldest));
}

function pairsOf(statuses: ReturnType<typeof billTransferStatuses>, ordered: readonly Bill[]): BillPair[] {
  const accs = new Map<string, Acc>();
  for (const bill of ordered) {
    for (const status of statuses.get(bill.id) ?? []) {
      if (!status.from || !status.to || status.from === status.to) continue;
      const key = billPairKey(status.from, status.to);
      const low = status.from < status.to ? status.from : status.to;
      const high = low === status.from ? status.to : status.from;
      const sign = status.from === low ? 1 : -1;
      let acc = accs.get(key);
      if (!acc) {
        acc = { low, high, remaining: 0, paid: 0, billIds: [] };
        accs.set(key, acc);
      }
      acc.remaining += sign * status.remaining;
      acc.paid += sign * status.paid;
      if (!acc.billIds.includes(bill.id)) acc.billIds.push(bill.id);
    }
  }
  const pairs: BillPair[] = [];
  for (const [key, acc] of accs) {
    const net = roundVnd(acc.remaining);
    if (Math.abs(net) < DEBT_ZERO) continue;
    const lowPays = net > 0;
    pairs.push({
      key,
      from: lowPays ? acc.low : acc.high,
      to: lowPays ? acc.high : acc.low,
      remaining: Math.abs(net),
      partial: Math.abs(roundVnd(acc.paid)) >= DEBT_ZERO,
      billIds: acc.billIds,
    });
  }
  return pairs.sort((a, b) => b.remaining - a.remaining || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** Tìm cặp theo khoá trong danh sách (null nếu cặp không còn khoản phải thanh toán). */
export function findBillPair(pairs: readonly BillPair[], key: string | null): BillPair | null {
  return key ? (pairs.find((pair) => pair.key === key) ?? null) : null;
}

/** Chỉ giữ các bill thuộc phạm vi của cặp (không chọn cặp thì giữ nguyên). */
export function filterBillsByPair<T extends Pick<Bill, 'id'>>(bills: readonly T[], pair: Pick<BillPair, 'billIds'> | null): T[] {
  if (!pair) return [...bills];
  const ids = new Set(pair.billIds);
  return bills.filter((bill) => ids.has(bill.id));
}

/** Một khoản trong chi tiết của cặp: lấy từ một bill, theo chiều A → B của cặp (hoặc chiều ngược lại để bù trừ). */
export interface BillPairItem {
  billId: string;
  title: string;
  date: Bill['date'];
  /** Số tiền của khoản chuyển trong bill này (đồng, luôn dương). */
  amount: Vnd;
  paid: Vnd;
  remaining: Vnd;
  state: 'paid' | 'unpaid' | 'partial';
  /** true: khoản chiều ngược lại (B phải trả A), được trừ bớt vào số còn phải trả của cặp. */
  offset: boolean;
}

/**
 * Các khoản tạo nên số còn phải trả của một cặp, trích từ chính các bill trong phạm vi của cặp: mỗi khoản "A phải trả B" trong từng bill
 * (kèm trạng thái thanh toán của nó) và, nếu có, các khoản chiều ngược lại đánh dấu `offset` vì được bù trừ. Mới nhất trước. Chỉ ĐỌC dữ liệu.
 */
export function buildBillPairItems(bills: readonly Bill[], pays: readonly Pay[], pair: Pick<BillPair, 'from' | 'to' | 'billIds'>): BillPairItem[] {
  const statuses = billTransferStatuses(bills, pays);
  const items: BillPairItem[] = [];
  for (const id of pair.billIds) {
    const bill = bills.find((item) => item.id === id);
    if (!bill) continue;
    for (const transfer of statuses.get(id) ?? []) {
      const forward = transfer.from === pair.from && transfer.to === pair.to;
      const backward = transfer.from === pair.to && transfer.to === pair.from;
      if (!forward && !backward) continue;
      items.push({ billId: id, title: bill.title, date: bill.date, amount: transfer.amount, paid: transfer.paid, remaining: transfer.remaining, state: transfer.state, offset: backward });
    }
  }
  return items.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}
