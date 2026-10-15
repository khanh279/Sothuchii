/**
 * HỢP ĐỒNG ỔN ĐỊNH cho các module khác (Quỹ nhóm, Chia bill) ghi vào chi tiêu cá nhân.
 * Tương ứng `window.SoTien.reg("a", { addExp, getExp, delExp, listSrc })` của PWA.
 *
 * Quy ước:
 * - Tiền là ĐỒNG (số nguyên). Module Chia bill lưu NGHÌN đồng nên phải đổi bằng `nghinToVnd` trước khi gọi.
 * - Module gọi phải tự lưu `ExpenseRef` ({ m, id }) trả về (quỹ lưu dạng `exp: { m, id }`).
 * - Muốn đổi một khoản tự ghi: `delExp(ref)` rồi `addExp(...)` lại, giống cách module Quỹ của PWA làm.
 * - Khoản tự ghi mang `src` ('cb' hoặc 'quy'); mọi sửa từ màn hình chi tiêu vẫn giữ nguyên `src`, `i`, `t`.
 * - Không thay đổi hình dạng các hàm này khi chưa cập nhật cả hai module gọi nó.
 */

import { MEMO_MAX } from '@/constants/categories';
import { addExpense, deleteExpense, getExpense, listBySource } from '@/data/expenseRepository';
import type { DateStr, Expense, ExpenseRef, ExpenseSource } from '@/types/expense';
import type { Vnd } from '@/types/money';
import { isValidDateStr } from '@/utils/date';

/** Độ dài tối đa của dòng chi tiết phụ `i`. */
export const DETAIL_MAX = 120;

export interface AddExpInput {
  /** Số tiền (đồng). Được làm tròn; sau khi làm tròn phải > 0. */
  a: Vnd;
  /** Id mục chi, ví dụ 'fund' cho Quỹ. */
  c: string;
  /** Nội dung, tối đa 80 ký tự. */
  n?: string;
  /** Dòng chi tiết phụ, tối đa 120 ký tự. */
  i?: string;
  /** Ngày chi, 'YYYY-MM-DD' theo giờ máy. */
  d: DateStr;
  src: ExpenseSource;
}

export class ExpenseInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpenseInputError';
  }
}

/** Ghi một khoản chi tự động; trả về tham chiếu để lưu lại. Ném ExpenseInputError nếu dữ liệu sai. */
export async function addExp(input: AddExpInput, now: number = Date.now()): Promise<ExpenseRef> {
  const a = Math.round(input.a);
  if (!Number.isFinite(a) || a <= 0) throw new ExpenseInputError('Số tiền phải lớn hơn 0.');
  if (!isValidDateStr(input.d)) throw new ExpenseInputError('Ngày không hợp lệ.');
  const expense: Expense = {
    a,
    c: input.c,
    n: String(input.n ?? '').slice(0, MEMO_MAX),
    i: String(input.i ?? '').slice(0, DETAIL_MAX),
    d: input.d,
    t: now,
    src: input.src,
  };
  return addExpense(expense, now);
}

/** Đọc một khoản đã ghi; null nếu không còn (hoặc `ref` trống). */
export async function getExp(ref: ExpenseRef | null | undefined): Promise<Expense | null> {
  if (!ref) return null;
  const found = await getExpense(ref);
  if (!found) return null;
  const { id, ...expense } = found;
  void id;
  return expense;
}

/** Xoá một khoản; true nếu có xoá. An toàn khi gọi với `ref` trống hoặc đã xoá. */
export async function delExp(ref: ExpenseRef | null | undefined): Promise<boolean> {
  if (!ref) return false;
  return deleteExpense(ref);
}

/** Liệt kê mọi khoản do một module tự ghi (dùng để dọn khoản mồ côi). */
export function listSrc(src: ExpenseSource): Promise<ExpenseRef[]> {
  return listBySource(src);
}
