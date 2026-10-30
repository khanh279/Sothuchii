/**
 * Trạng thái TỪNG KHOẢN VAY (hàm thuần, suy ra từ sổ, không lưu thêm): sổ vay là sổ cộng trừ nên mỗi khoản trả (chuyển tiền ngược chiều nợ còn lại) được phân bổ vào các khoản vay còn nợ để biết khoản nào
 * đã trả xong, trả một phần hay chưa trả. Khoản trả được chọn đích danh (`LoanLine.targets`, từ "Chọn các khoản thanh toán") trừ vào ĐÚNG các khoản đó trước; phần còn lại và các khoản trả thường trừ theo
 * thứ tự khoản CŨ NHẤT trước (như nợ bill). Tiền là ĐỒNG.
 */

import { DEBT_ZERO, type LoanLine } from '@/domain/ledger';
import type { Vnd } from '@/types/money';

export type LoanLineState = 'paid' | 'partial' | 'unpaid';

export interface LoanLineView {
  line: LoanLine;
  /** 'debt' = khoản vay cùng chiều với nợ còn lại (cần trả); 'repay' = khoản trả ngược chiều. */
  kind: 'debt' | 'repay';
  /** Giá trị tuyệt đối của khoản. */
  amount: Vnd;
  /** Đã trả (chỉ khoản 'debt') và số còn lại. */
  paid: Vnd;
  remaining: Vnd;
  state: LoanLineState;
}

/** Khoản vay chọn được để thanh toán: còn nợ và có mã khoản gốc (để ghi đích danh). */
export const isPickableLoan = (view: Pick<LoanLineView, 'kind' | 'remaining' | 'line'>): boolean => view.kind === 'debt' && view.remaining > DEBT_ZERO && !!view.line.id;

/** `net`: nợ vay ròng hiện tại (dương = họ nợ tôi, âm = tôi nợ họ); các khoản cùng dấu với `net` là khoản vay, ngược dấu là khoản trả. */
export function loanLineViews(lines: readonly LoanLine[], net: Vnd): LoanLineView[] {
  const netSign = Math.sign(net);
  const views: LoanLineView[] = lines.map((line) => {
    const amount = Math.abs(line.v);
    const debt = netSign !== 0 && Math.sign(line.v) === netSign;
    return { line, kind: debt ? 'debt' : 'repay', amount, paid: 0, remaining: debt ? amount : 0, state: 'unpaid' };
  });
  const take = (view: LoanLineView, amount: Vnd): Vnd => {
    const part = Math.min(view.remaining, amount);
    view.paid += part;
    view.remaining -= part;
    return amount - part;
  };
  views.forEach((repay, index) => {
    if (repay.kind !== 'repay') return;
    let left = repay.amount;
    const earlier = views.slice(0, index).filter((view) => view.kind === 'debt');
    for (const id of repay.line.targets ?? []) {
      const target = earlier.find((view) => view.line.id === id);
      if (target && left > 0) left = take(target, left);
    }
    for (const view of earlier) {
      if (left <= 0) break;
      left = take(view, left);
    }
  });
  for (const view of views) {
    if (view.kind !== 'debt') continue;
    view.state = view.remaining <= DEBT_ZERO ? 'paid' : view.paid > 0 ? 'partial' : 'unpaid';
  }
  return views;
}

export const loanKey = (view: Pick<LoanLineView, 'line'>): string | null => (view.line.id ? `loan:${view.line.id}` : null);

/** Khoản vay còn nợ (chưa trả xong): chỉ các khoản này hiện ở danh sách nợ; khoản trả ngược chiều và khoản đã trả xong xem ở ngăn xếp / lịch sử giao dịch. */
export const isOwedLoan = (view: LoanLineView): boolean => view.kind === 'debt' && view.state !== 'paid';

/** Khoản vay đã trả xong và chưa bị "Xóa lịch sử" (nằm ở ngăn xếp "Đã thanh toán"). */
export function paidLoanViews(views: readonly LoanLineView[], hidden: ReadonlySet<string>): LoanLineView[] {
  return views.filter((view) => view.kind === 'debt' && view.state === 'paid' && !(loanKey(view) && hidden.has(loanKey(view) as string)));
}
