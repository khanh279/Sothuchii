import type { DateStr, ExpenseRef } from '@/types/expense';
import type { Vnd } from '@/types/money';

/**
 * Dữ liệu Chia bill, đúng schema `v2` của PWA (khóa `chiabill:v2:bills`).
 * ĐƠN VỊ: mọi số tiền ở đây là ĐỒNG (số nguyên), giống Chi tiêu cá nhân. Dữ liệu cũ lưu NGHÌN đồng được
 * chuyển một lần sang đồng (`data/moneyMigration`).
 */

/** Một người trong bill, như khi lưu. */
export interface BillPerson {
  name: string;
  /** Số tiền người này đã chi (đồng). */
  paid: Vnd;
  /** Hệ số chia (mặc định 1). */
  w?: number;
  /** Mức cố định (đồng); không có = chia theo hệ số. */
  fix?: Vnd;
}

export interface Bill {
  id: string;
  title: string;
  date: DateStr;
  createdAt: number;
  /** Mục chi cá nhân dùng khi ghi sang chi tiêu (mặc định 'other'). */
  cat: string;
  people: BillPerson[];
  /** Khoản chi cá nhân `src:'cb'` đã tạo từ bill này. */
  exp?: ExpenseRef;
}

/** Một dòng kết quả chia của một người. */
export interface SplitRow {
  index: number;
  name: string;
  paid: Vnd;
  /** Hệ số đã áp dụng (1 nếu cố định hoặc cả nhóm không có hệ số hợp lệ). */
  w: number;
  fixed: boolean;
  /** Phần phải trả (đồng). */
  share: Vnd;
  /** Đã chi trừ phần: dương = nhận lại, âm = còn thiếu. */
  net: Vnd;
}

/** Một khoản chuyển gợi ý: `from` trả `to` (amt: đồng). */
export interface Transfer {
  from: string;
  to: string;
  amt: Vnd;
}

/** 'over' = tổng mức cố định lớn hơn tổng bill; 'gap' = ai cũng cố định nhưng cộng lại khác tổng bill. */
export type SplitProblem = 'over' | 'gap' | '';

export interface BillSplit {
  n: number;
  total: Vnd;
  /** Giá trị của một phần (hoặc mỗi người khi chia đều). */
  share: Vnd;
  /** Chia đều cho mọi người (không có mức cố định, hệ số đều 1). */
  even: boolean;
  rows: SplitRow[];
  sumFix: Vnd;
  bad: SplitProblem;
  transfers: Transfer[];
}
