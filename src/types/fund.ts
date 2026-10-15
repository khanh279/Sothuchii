import type { DateStr, ExpenseRef } from '@/types/expense';
import type { Vnd } from '@/types/money';

/**
 * Dữ liệu Quỹ nhóm, đúng định dạng PWA lưu ở khóa `quy_nhom_v1`.
 * Mọi số tiền lưu bằng ĐỒNG (Vnd). Ô nhập "đóng quỹ" tính theo nghìn đồng nhưng được đổi sang đồng khi lưu;
 * ô nhập "chi quỹ" nhập thẳng đồng.
 */

export interface Fund {
  id: string;
  /** Tên quỹ, tối đa 40 ký tự. */
  name: string;
}

/** Một người trong lần đóng quỹ. Tên "Tôi" (sau khi cắt khoảng trắng) là phần của chính người dùng. */
export interface ContributionPerson {
  name: string;
  /** Số tiền (đồng). */
  amount: Vnd;
}

/** Một lần đóng quỹ (nhiều người đóng). */
export interface Contribution {
  id: string;
  fundId: string;
  title: string;
  date: DateStr;
  /** Khoản chi cá nhân tự ghi tương ứng với phần của "Tôi" (nếu có). */
  exp?: ExpenseRef;
  people: ContributionPerson[];
}

/** Một khoản chi từ quỹ. */
export interface FundExpense {
  id: string;
  fundId: string;
  title: string;
  date: DateStr;
  /** Số tiền (đồng). */
  amount: Vnd;
}

export interface FundData {
  funds: Fund[];
  contribs: Contribution[];
  expenses: FundExpense[];
  /** Quỹ đang chọn lần trước (id) hoặc '' khi chưa có quỹ. */
  cur: string;
}

/** Tổng đóng / chi / số dư của một quỹ (hoặc của tất cả quỹ). Số dư có thể âm. */
export interface FundTotals {
  in: Vnd;
  out: Vnd;
  bal: Vnd;
}
