/**
 * Khoản chi cá nhân được TẠO TỰ ĐỘNG từ nơi khác chỉ được sửa/xoá tại nguồn (nếu sửa trực tiếp, lần đồng bộ sau sẽ hoàn lại):
 * `src:'quy'` từ Quỹ nhóm, `src:'cb'` từ Chia bill hoặc khoản trả nợ. Khoản người dùng tự nhập (không có `src`) thì sửa tự do.
 */

import { FUND_LINKED_EDIT_MESSAGE } from '@/domain/funds';

export const BILL_LINKED_MESSAGE = 'Khoản này được tạo từ Chia bill hoặc khoản trả nợ, vui lòng sửa hoặc xoá tại nguồn';

/** Câu giải thích vì sao không sửa/xoá trực tiếp được; `null` nếu khoản này được phép thao tác. */
export function linkedExpenseNotice(expense: { src?: string }): string | null {
  if (expense.src === 'quy') return FUND_LINKED_EDIT_MESSAGE;
  if (expense.src === 'cb') return BILL_LINKED_MESSAGE;
  return null;
}
