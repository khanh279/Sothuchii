/**
 * Thanh toán các khoản ĐƯỢC CHỌN (hàm thuần) ở trang chi tiết nợ với MỘT người và trang thanh toán bill của một cặp: người dùng tích chọn một số khoản nợ bill và/hoặc dòng nợ vay
 * rồi thanh toán đúng những khoản đó. Chỉ tính tổng và kiểm tra hợp lệ; việc ghi do `recordMergedPaymentSynced` (nợ bill) và `recordPaymentSynced` (nợ vay) đảm nhiệm. Tiền là ĐỒNG.
 *
 * - Nợ bill: chỉ khoản CÙNG chiều với cặp (không phải bù trừ) mới chọn được; số trả = tổng số còn lại của đúng các bill đã chọn nên MỖI bill đã chọn được thanh toán đủ (không dồn sang bill khác).
 * - Nợ vay: sổ vay là sổ cộng trừ, không đánh dấu từng dòng; số phải trả là |tổng có dấu của các dòng đã chọn| (phải cùng chiều với nợ vay còn lại) và khoản trả được ghi chú tên các dòng đã chọn.
 * - Chiều: các khoản chọn phải CÙNG chiều ("tôi trả" hoặc "người kia trả tôi") để một lần thanh toán không vừa trả vừa nhận.
 */

import { isNearZero } from '@/domain/ledger';
import type { BillPair, BillPairItem } from '@/domain/billPairs';
import type { LoanLine } from '@/domain/ledger';
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
  /** Phần nợ vay: số tiền thanh toán và nội dung các dòng vay đã chọn (làm ghi chú của khoản trả). Null nếu không chọn dòng vay nào. */
  loan: { amount: Vnd; titles: string[] } | null;
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
  loanLines: readonly LoanLine[];
  pickedLoans: ReadonlySet<number>;
  /** Nợ vay ròng hiện tại (dương = họ nợ tôi, âm = tôi nợ họ). */
  loanNet: Vnd;
}): PickedPayment {
  const bills = input.pair ? input.billItems.filter((item) => isPickableBill(item) && input.pickedBills.has(item.billId)) : [];
  const lines = input.loanLines.filter((_, index) => input.pickedLoans.has(index));
  const count = bills.length + lines.length;
  const empty: PickedPayment = { ok: false, count, direction: null, bill: null, loan: null, total: 0 };
  if (count === 0) return empty;

  const billAmount = bills.reduce((sum, item) => sum + item.remaining, 0);
  const billDir: PickDirection | null = bills.length > 0 && input.pair ? (input.pair.from === input.owner ? 'owe' : 'get') : null;
  const loanSum = lines.reduce((sum, line) => sum + line.v, 0);
  const loanDir: PickDirection | null = lines.length === 0 || isNearZero(loanSum) ? null : loanSum < 0 ? 'owe' : 'get';
  const loanNetDir: PickDirection | null = isNearZero(input.loanNet) ? null : input.loanNet < 0 ? 'owe' : 'get';

  if (lines.length > 0 && !loanDir) return { ...empty, reason: 'Các khoản vay đã chọn bù nhau về 0, không có gì để thanh toán.' };
  if (billDir && loanDir && billDir !== loanDir) return { ...empty, reason: 'Chỉ chọn các khoản cùng chiều: tôi trả hoặc người kia trả tôi.' };
  if (loanDir && loanDir !== loanNetDir) return { ...empty, reason: 'Các khoản vay đã chọn ngược chiều với nợ vay còn lại.' };

  const loanAmount = lines.length > 0 ? Math.abs(loanSum) : 0;
  return {
    ok: true,
    count,
    direction: billDir ?? loanDir,
    bill: bills.length > 0 && input.pair ? { from: input.pair.from, to: input.pair.to, billIds: bills.map((item) => item.billId), titles: bills.map((item) => item.title || 'Không tên'), amount: billAmount } : null,
    loan: lines.length > 0 ? { amount: loanAmount, titles: lines.map((line) => line.title) } : null,
    total: billAmount + loanAmount,
  };
}
