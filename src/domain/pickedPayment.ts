/**
 * Thanh toán các khoản ĐƯỢC CHỌN (hàm thuần) ở trang chi tiết nợ với MỘT người và trang thanh toán bill của một cặp: người dùng tích chọn một số khoản nợ bill và/hoặc dòng nợ vay
 * rồi thanh toán đúng những khoản đó. Chỉ tính tổng và kiểm tra hợp lệ; việc ghi do `recordMergedPaymentSynced` (nợ bill) và `recordPaymentSynced` (nợ vay) đảm nhiệm. Tiền là ĐỒNG.
 *
 * - Nợ bill: chỉ khoản CÙNG chiều với cặp (không phải bù trừ) mới chọn được; số trả = tổng số còn lại của đúng các bill đã chọn nên MỖI bill đã chọn được thanh toán đủ (không dồn sang bill khác).
 * - Nợ vay: chỉ khoản vay còn nợ (không phải khoản trả) mới chọn được; số trả = tổng số còn lại của các khoản đã chọn và khoản trả ghi mã các khoản đó để trừ đúng vào đó (xem `loanLineViews`).
 * - Chiều: các khoản chọn phải CÙNG chiều ("tôi trả" hoặc "người kia trả tôi") để một lần thanh toán không vừa trả vừa nhận.
 */

import { isPickableLoan, type LoanLineView } from '@/domain/loanAllocation';
import type { BillPair, BillPairItem } from '@/domain/billPairs';
import type { Vnd } from '@/types/money';

export type PickDirection = 'owe' | 'get';

export interface PickedPayment {
  ok: boolean;
  /** Lý do chưa thanh toán được (khi `ok` = false và đã chọn ít nhất một khoản). */
  reason?: string;
  /** Số khoản đã chọn (bill + dòng vay). */
  count: number;
  /** 'owe' = tôi trả, 'get' = người kia trả tôi; null khi chưa chọn gì. */
  direction: PickDirection | null;
  /** Phần nợ bill: cặp, các bill đã chọn và số tiền (tổng số còn lại của chúng). Null nếu không chọn bill nào. */
  bill: { from: string; to: string; billIds: string[]; titles: string[]; amount: Vnd } | null;
  /** Phần nợ vay: số tiền thanh toán (tổng số còn lại của các khoản vay đã chọn), mã khoản gốc để ghi đích danh và nội dung (làm ghi chú của khoản trả). Null nếu không chọn khoản vay nào. */
  loan: { amount: Vnd; ids: string[]; titles: string[] } | null;
  total: Vnd;
}

/** Ghi chú một dòng cho hộp xác nhận: "Thanh toán N bill đã chọn", "Thanh toán x khoản vay đã chọn" hoặc, khi chọn cả hai loại, "Thanh toán N bill, x khoản vay đã chọn". */
export function pickedNote(picked: Pick<PickedPayment, 'bill' | 'loan'>): string {
  const bills = picked.bill?.billIds.length ?? 0;
  const loans = picked.loan?.titles.length ?? 0;
  if (bills > 0 && loans > 0) return `Thanh toán ${bills} bill, ${loans} khoản vay đã chọn`;
  if (bills > 0) return `Thanh toán ${bills} bill đã chọn`;
  return `Thanh toán ${loans} khoản vay đã chọn`;
}

/** Khoản bill có chọn được không: còn nợ và cùng chiều với cặp (khoản bù trừ không chọn). */
export const isPickableBill = (item: Pick<BillPairItem, 'offset' | 'remaining'>): boolean => !item.offset && item.remaining > 0;

export function summarizePicked(input: {
  pair: Pick<BillPair, 'from' | 'to'> | null;
  /** Tên người của mình ("Tôi") để biết chiều của cặp. */
  owner: string;
  billItems: readonly BillPairItem[];
  pickedBills: ReadonlySet<string>;
  /** Các khoản vay kèm trạng thái (xem `loanLineViews`) và chỉ số các khoản đã tích. */
  loanViews: readonly LoanLineView[];
  pickedLoans: ReadonlySet<number>;
  /** Nợ vay ròng hiện tại (dương = họ nợ tôi, âm = tôi nợ họ). */
  loanNet: Vnd;
}): PickedPayment {
  const bills = input.pair ? input.billItems.filter((item) => isPickableBill(item) && input.pickedBills.has(item.billId)) : [];
  const lines = input.loanViews.filter((view, index) => input.pickedLoans.has(index) && isPickableLoan(view));
  const count = bills.length + lines.length;
  const empty: PickedPayment = { ok: false, count, direction: null, bill: null, loan: null, total: 0 };
  if (count === 0) return empty;

  const billAmount = bills.reduce((sum, item) => sum + item.remaining, 0);
  const billDir: PickDirection | null = bills.length > 0 && input.pair ? (input.pair.from === input.owner ? 'owe' : 'get') : null;
  const loanAmount = lines.reduce((sum, view) => sum + view.remaining, 0);
  const loanDir: PickDirection | null = lines.length === 0 ? null : input.loanNet < 0 ? 'owe' : 'get';

  if (billDir && loanDir && billDir !== loanDir) return { ...empty, reason: 'Chỉ chọn các khoản cùng chiều: tôi trả hoặc người kia trả tôi.' };

  return {
    ok: true,
    count,
    direction: billDir ?? loanDir,
    bill: bills.length > 0 && input.pair ? { from: input.pair.from, to: input.pair.to, billIds: bills.map((item) => item.billId), titles: bills.map((item) => item.title || 'Không tên'), amount: billAmount } : null,
    loan: lines.length > 0 ? { amount: loanAmount, ids: lines.map((view) => view.line.id ?? ''), titles: lines.map((view) => view.line.title) } : null,
    total: billAmount + loanAmount,
  };
}
