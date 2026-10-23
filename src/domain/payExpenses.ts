/**
 * Chi tiêu cá nhân tự sinh từ khoản trả nợ bill (hàm `nxAlloc` và phần khoản trả của `N()` trong PWA), hàm thuần.
 *
 * Chỉ tính khi tôi THỰC SỰ trả bill hoặc gộp nợ làm giảm nợ bill của tôi: số tiền đó được trừ dần (phân bổ chung
 * `allocateBillPayments`: theo thứ tự thời gian, bill cũ trước) vào các bill mà tôi còn nợ người đó, mỗi phần thành một khoản chi cá nhân `src:'cb'` theo mục chi của bill.
 * Chỉ LẬP KẾ HOẠCH; việc ghi nằm ở tầng `data` (bước 5B). Tiền của sổ và của khoản chi đều là ĐỒNG.
 */

import { DETAIL_MAX, MEMO_MAX } from '@/constants/categories';
import { allocateBillPayments } from '@/domain/billAllocation';
import { BILL_OWNER_NAME, DEFAULT_BILL_CATEGORY, DEFAULT_BILL_TITLE, planBillExpenseSync, type BillSyncAction } from '@/domain/bills';
import type { LinkedExpenseSnapshot } from '@/domain/funds';
import { payClass } from '@/domain/ledger';
import { payExpenseRefs } from '@/domain/pays';
import type { Bill } from '@/types/bill';
import type { DateStr, ExpenseRef } from '@/types/expense';
import type { Pay, PayAllocation } from '@/types/pay';


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
  for (const [pay, takes] of allocateBillPayments(bills, pays).byPay) {
    if (String(pay.from || '').trim() !== BILL_OWNER_NAME) continue; // chỉ khi tôi trả họ (nợ của tôi giảm)
    const label = payClass(pay) === 'bt' ? 'Bù trừ nợ ' : 'Trả ';
    const kept: PayAllocation[] = [];
    for (const { slot, amount } of takes) {
      const a = Math.round(amount);
      if (a <= 0) continue;
      kept.push({ a, c: slot.bill.cat || DEFAULT_BILL_CATEGORY, n: slot.bill.title || DEFAULT_BILL_TITLE, d: String(pay.date), i: `${label}${slot.to} · bill ${dayMonth(slot.bill.date)}` });
    }
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
