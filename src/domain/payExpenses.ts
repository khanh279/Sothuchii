/**
 * Chi tiêu cá nhân tự sinh từ khoản trả nợ bill (hàm `nxAlloc` và phần khoản trả của `N()` trong PWA), hàm thuần.
 *
 * Chỉ tính khi tôi THỰC SỰ trả bill hoặc gộp nợ làm giảm nợ bill của tôi: số tiền đó được trừ dần (theo thứ tự thời gian,
 * bill cũ trước) vào các bill mà tôi còn nợ người đó, mỗi phần thành một khoản chi cá nhân `src:'cb'` theo mục chi của bill.
 * Chỉ LẬP KẾ HOẠCH; việc ghi nằm ở tầng `data` (bước 5B). Tiền của sổ là NGHÌN đồng, của khoản chi là ĐỒNG.
 */

import { DETAIL_MAX, MEMO_MAX } from '@/constants/categories';
import { DEFAULT_BILL_CATEGORY, DEFAULT_BILL_TITLE, planBillExpenseSync, type BillSyncAction } from '@/domain/bills';
import type { LinkedExpenseSnapshot } from '@/domain/funds';
import { debtEvents } from '@/domain/ledger';
import { payExpenseRefs } from '@/domain/pays';
import type { Bill } from '@/types/bill';
import type { DateStr, ExpenseRef } from '@/types/expense';
import type { Pay, PayAllocation } from '@/types/pay';

const EPS = 1e-6;

/** Ngày dd/mm từ 'YYYY-MM-DD' (`O(date).slice(0,5)`). */
function dayMonth(date: string): string {
  const parts = String(date).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(date).slice(0, 5);
}

/**
 * Phân bổ khoản trả vào các bill còn nợ (`nxAlloc`). Kết quả theo `pay.id`; mỗi phần là một khoản chi cá nhân
 * `{ a: đồng nguyên, c: mục của bill, n: tên bill, d: ngày trả, i: "Trả <ai> · bill dd/mm" }`
 * ("Bù trừ nợ <ai> · bill dd/mm" với khoản gộp nợ). Phần làm tròn về 0 đồng bị bỏ.
 */
export function allocatePayments(bills: readonly Bill[], pays: readonly Pay[]): Record<string, PayAllocation[]> {
  const result: Record<string, PayAllocation[]> = {};
  const queues = new Map<string, { left: number; cat: string; title: string; day: string }[]>();
  for (const event of debtEvents(bills, pays)) {
    if (event.led !== 'bill') continue;
    let queue = queues.get(event.who);
    if (!queue) {
      queue = [];
      queues.set(event.who, queue);
    }
    if (event.k === 'bill') {
      // Tôi nợ người này ở bill này: xếp hàng chờ được trả.
      if (event.v < 0 && event.bill) {
        queue.push({ left: -event.v, cat: event.bill.cat || DEFAULT_BILL_CATEGORY, title: event.bill.title || DEFAULT_BILL_TITLE, day: dayMonth(event.bill.date) });
      }
      continue;
    }
    if (event.v <= 0 || !event.pay) continue; // chỉ khi tôi trả họ (nợ của tôi giảm)
    const pay = event.pay;
    let amount = event.v;
    const label = event.k === 'bt' ? 'Bù trừ nợ ' : 'Trả ';
    const out: PayAllocation[] = [];
    for (const item of queue) {
      if (amount > EPS && item.left > EPS) {
        const take = Math.min(item.left, amount);
        item.left -= take;
        amount -= take;
        out.push({ a: Math.round(take * 1e3), c: item.cat, n: item.title, d: String(pay.date), i: `${label}${event.who} · bill ${item.day}` });
      }
    }
    const kept = out.filter((x) => x.a > 0);
    if (kept.length) result[pay.id] = (result[pay.id] ?? []).concat(kept);
  }
  return result;
}

/** Khoản chi cá nhân mà một khoản trả cần có, đúng dạng `addExp` sẽ lưu (n và i cắt 80 / 120 ký tự để so sánh ổn định). */
export interface DesiredPayExpense {
  a: number;
  c: string;
  n: string;
  d: DateStr;
  i: string;
  src: 'cb';
}

export type PaySyncAction =
  /** Danh sách khoản chi của khoản trả khác với cần có: tạo mới `expenses`, rồi xoá `remove`, rồi ghi `pay.exp`. */
  | { type: 'replace'; payId: string; remove: ExpenseRef[]; expenses: DesiredPayExpense[] }
  /** Khoản trả không còn cần khoản chi nào: xoá `remove` và bỏ `pay.exp`. */
  | { type: 'unlink'; payId: string; remove: ExpenseRef[] };

export interface DebtSyncPlan {
  /** Hành động cho bill (thêm / thay / bỏ liên kết), không gồm xoá mồ côi. */
  bills: BillSyncAction[];
  pays: PaySyncAction[];
  /** Khoản `src:'cb'` không bill hay khoản trả nào trỏ tới: xoá. Tính một lần cho cả hai nguồn, không trùng. */
  orphans: ExpenseRef[];
}

const refKey = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;

function sameList(current: (LinkedExpenseSnapshot | null)[], desired: DesiredPayExpense[]): boolean {
  return (
    current.length === desired.length &&
    desired.every((want, index) => {
      const have = current[index];
      return !!have && have.a === want.a && have.c === want.c && have.n === want.n && have.d === want.d && (have.i || '') === want.i;
    })
  );
}

/**
 * Kế hoạch đồng bộ chi tiêu cá nhân cho CẢ bill và khoản trả (`N()` của PWA), HÀM THUẦN.
 *
 * - `lookup`: đọc khoản chi cá nhân theo tham chiếu (null nếu không còn).
 * - `cbRefs`: mọi khoản chi cá nhân mang `src:'cb'` (từ `listSrc('cb')`).
 *
 * An toàn dữ liệu: chỉ XOÁ khoản mang `src:'cb'`. Tham chiếu trỏ nhầm vào khoản người dùng tự nhập (không nhãn đó) thì chỉ
 * bị bỏ liên kết, không bị xoá. Khoản mồ côi chỉ tính khi KHÔNG bill nào và KHÔNG khoản trả nào trỏ tới; khoản người dùng
 * tự nhập và khoản `src:'quy'` không nằm trong `cbRefs` nên không bao giờ bị xoá.
 * Trường `nexp` cũ không được đọc.
 */
export function planDebtExpenseSync(input: {
  bills: readonly Bill[];
  pays: readonly Pay[];
  lookup: (ref: ExpenseRef) => LinkedExpenseSnapshot | null;
  cbRefs: readonly ExpenseRef[];
}): DebtSyncPlan {
  const { bills, pays, lookup, cbRefs } = input;

  const billActions = planBillExpenseSync({ bills, lookup, cbRefs: [] });

  const allocations = allocatePayments(bills, pays);
  const payActions: PaySyncAction[] = [];
  for (const pay of pays) {
    if (!pay.id) continue; // không có mã thì không liên kết được
    const desired: DesiredPayExpense[] = (allocations[pay.id] ?? []).map((item) => ({
      ...item,
      n: item.n.slice(0, MEMO_MAX),
      i: item.i.slice(0, DETAIL_MAX),
      src: 'cb' as const,
    }));
    const refs = pay.exp ?? [];
    const current = refs.map((ref) => lookup(ref));
    if (sameList(current, desired)) continue;
    const remove = refs.filter((_, index) => current[index]?.src === 'cb');
    if (desired.length) payActions.push({ type: 'replace', payId: pay.id, remove, expenses: desired });
    else if (refs.length) payActions.push({ type: 'unlink', payId: pay.id, remove });
  }

  const referenced = new Set<string>();
  for (const bill of bills) if (bill.exp) referenced.add(refKey(bill.exp));
  for (const ref of payExpenseRefs(pays)) referenced.add(refKey(ref));
  const seen = new Set<string>();
  const orphans: ExpenseRef[] = [];
  for (const ref of cbRefs) {
    const key = refKey(ref);
    if (referenced.has(key) || seen.has(key)) continue;
    seen.add(key);
    orphans.push(ref);
  }
  return { bills: billActions, pays: payActions, orphans };
}
