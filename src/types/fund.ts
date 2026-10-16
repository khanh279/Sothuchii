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

/**
 * Hình thức chi của một khoản chi thực tế (chỉ lưu khi KHÁC "quỹ chi trực tiếp"; thiếu = quỹ chi trực tiếp, đúng dữ liệu cũ):
 * - 'personal': cá nhân tự ứng tiền túi chi cho quỹ (`payer`); quỹ nợ người đó đến khi thanh toán.
 * - 'advance': chi từ tiền quỹ đã giao ứng trước (`advanceId`, `payer` = người nhận ứng).
 */
export type FundExpenseMode = 'personal' | 'advance';

/** Một khoản chi từ quỹ (chi thực tế: luôn được tính vào tổng chi đúng một lần, dù ai bỏ tiền). */
export interface FundExpense {
  id: string;
  fundId: string;
  title: string;
  date: DateStr;
  /** Số tiền (đồng). */
  amount: Vnd;
  /** Người chi (chỉ có với hình thức 'personal' / 'advance'). */
  payer?: string;
  mode?: FundExpenseMode;
  /** Hồ sơ ứng trước mà khoản chi này thuộc về (hình thức 'advance'). */
  advanceId?: string;
}

/**
 * Hồ sơ ứng trước: quỹ giao `amount` (đồng, có thể 0) cho `person` để chi hộ. Chỉ là dòng tiền quỹ đã xuất, CHƯA phải chi phí; chi phí thực tế
 * là các `FundExpense` có `advanceId` trỏ về hồ sơ này. Trạng thái quyết toán được TÍNH từ các khoản chi / hoàn tiền / thanh toán, không lưu.
 */
export interface Advance {
  id: string;
  fundId: string;
  person: string;
  title: string;
  date: DateStr;
  amount: Vnd;
}

/**
 * Giao dịch tiền của quỹ không phải chi phí và không phải thu: 'refund' = người ứng hoàn lại tiền thừa cho quỹ (cần `advanceId`);
 * 'payout' = quỹ trả tiền cho cá nhân (thanh toán khoản cá nhân đã ứng — `expenseId` — hoặc trả thêm phần chi vượt tiền ứng — `advanceId`).
 */
export type FundTxnKind = 'refund' | 'payout';

export interface FundTxn {
  id: string;
  fundId: string;
  kind: FundTxnKind;
  person: string;
  amount: Vnd;
  date: DateStr;
  advanceId?: string;
  expenseId?: string;
}

export interface FundData {
  funds: Fund[];
  contribs: Contribution[];
  expenses: FundExpense[];
  /** Hồ sơ ứng trước và giao dịch hoàn tiền / thanh toán (khóa `advances`, `fundTxns` của kho; thiếu ở dữ liệu cũ = rỗng). */
  advances?: Advance[];
  txns?: FundTxn[];
  /** Quỹ đang chọn lần trước (id) hoặc '' khi chưa có quỹ. */
  cur: string;
}

/** Tổng đóng / chi / số dư của một quỹ (hoặc của tất cả quỹ). Số dư có thể âm. */
export interface FundTotals {
  in: Vnd;
  out: Vnd;
  bal: Vnd;
}
