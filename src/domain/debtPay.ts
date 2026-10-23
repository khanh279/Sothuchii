/**
 * Kế hoạch "Thanh toán" công nợ với MỘT người (hàm thuần): bốn lựa chọn Nợ bill / Nợ vay / Một phần / Toàn bộ.
 * Tiền là ĐỒNG. Chỉ lập các bản nháp khoản trả; việc ghi và đồng bộ nằm ở `data/payService`.
 *
 * Quy tắc (theo yêu cầu 6D, dựa trên `paymentDraft` của PWA):
 * - Chỉ thanh toán khi hai sổ CÙNG dấu hoặc chỉ một sổ còn nợ. Hai sổ trái dấu → rỗng (phải "Gộp nợ" trước, không tự bù trừ).
 * - "Một phần": trả nợ bill trước, còn tiền thì trả nợ vay; còn dư nữa thì ghi thành một khoản vay MỚI (bản ghi riêng,
 *   ghi chú "Trả dư"). Phần dư cùng chiều tiền với khoản trả, nên sổ vay đổi dấu (người kia chuyển sang nợ ngược lại).
 * - Không bỏ sót đồng nào: tổng các khoản nháp bằng số tiền nhập (đã làm tròn `r3`).
 */

import { canMerge, isNearZero, paymentDraft, type PayDraft } from '@/domain/ledger';
import type { Vnd } from '@/types/money';
import type { Ledger, PersonDebt } from '@/types/pay';
import { roundVnd } from '@/domain/money';
import { formatVnd } from '@/utils/format';

export type DebtPayOption = 'bill' | 'loan' | 'partial' | 'all';

/** Ghi chú của khoản vay mới sinh ra từ phần tiền trả dư. */
export const PAY_SURPLUS_NOTE = 'Trả dư';

/** Số tiền tối đa trả được ở sổ `ledger`: trị tuyệt đối số dư, 0 nếu đã hết nợ (dưới 50 đồng). */
const owed = (debt: Pick<PersonDebt, 'loan' | 'bill'>, ledger: Ledger): Vnd => (isNearZero(debt[ledger]) ? 0 : roundVnd(Math.abs(debt[ledger])));

/**
 * Các bản nháp khoản trả cho `debt` theo lựa chọn `option` (`amount` chỉ dùng cho 'partial').
 * Thứ tự: nợ bill, nợ vay, rồi (nếu có) phần dư.
 */
export function planDebtPayment(debt: PersonDebt, option: DebtPayOption, amount?: Vnd): PayDraft[] {
  if (canMerge(debt)) return [];
  const billOwed = owed(debt, 'bill');
  const loanOwed = owed(debt, 'loan');
  if (!(billOwed > 0) && !(loanOwed > 0)) return [];

  const drafts: PayDraft[] = [];
  const add = (ledger: Ledger, value: Vnd) => {
    const draft = value > 0 ? paymentDraft(debt, ledger, value) : null;
    if (draft) drafts.push(draft);
  };

  if (option === 'bill') add('bill', billOwed);
  else if (option === 'loan') add('loan', loanOwed);
  else if (option === 'all') {
    add('bill', billOwed);
    add('loan', loanOwed);
  } else {
    const total = roundVnd(Number(amount));
    if (!(total > 0)) return [];
    const toBill = Math.min(total, billOwed);
    const toLoan = Math.min(roundVnd(total - toBill), loanOwed);
    const surplus = roundVnd(total - toBill - toLoan);
    add('bill', toBill);
    add('loan', toLoan);
    if (surplus > 0) {
      // Cùng chiều tiền với khoản trả; lấy chiều từ một sổ còn nợ (hai sổ cùng dấu nên chiều giống nhau).
      const ref: Ledger = billOwed > 0 ? 'bill' : 'loan';
      const base = paymentDraft(debt, ref, surplus);
      if (base) drafts.push({ kind: 'vay', from: base.from, to: base.to, amt: surplus, note: PAY_SURPLUS_NOTE });
    }
  }
  return drafts;
}

/** Câu thông báo sau khi ghi: "Đã ghi Tôi → An 300.000 ₫ · Tôi → An 500.000 ₫". Rỗng nếu không có khoản nào. */
export function debtPaymentMessage(drafts: readonly Pick<PayDraft, 'from' | 'to' | 'amt'>[]): string {
  if (!drafts.length) return '';
  return `Đã ghi ${drafts.map((d) => `${d.from} → ${d.to} ${formatVnd(d.amt)}`).join(' · ')}`;
}
