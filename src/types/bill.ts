import type { DateStr, ExpenseRef } from '@/types/expense';
import type { Nghin } from '@/types/money';

/**
 * Dữ liệu Chia bill, đúng schema `v2` của PWA (khóa `chiabill:v2:bills`).
 * LƯU Ý ĐƠN VỊ: mọi số tiền ở đây là NGHÌN đồng (có thể lẻ). Chi tiêu cá nhân thì lưu ĐỒNG;
 * phải đổi bằng `nghinToVnd` khi sang chi tiêu cá nhân.
 */

/** Một người trong bill, như khi lưu. */
export interface BillPerson {
  name: string;
  /** Số tiền người này đã chi (nghìn đồng). */
  paid: Nghin;
  /** Hệ số chia (mặc định 1). */
  w?: number;
  /** Mức cố định (nghìn đồng); không có = chia theo hệ số. */
  fix?: Nghin;
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
  paid: Nghin;
  /** Hệ số đã áp dụng (1 nếu cố định hoặc cả nhóm không có hệ số hợp lệ). */
  w: number;
  fixed: boolean;
  /** Phần phải trả (nghìn đồng). */
  share: Nghin;
  /** Đã chi trừ phần: dương = nhận lại, âm = còn thiếu. */
  net: Nghin;
}

/** Một khoản chuyển gợi ý: `from` trả `to` (amt: nghìn đồng, đã chính xác đến đồng). */
export interface Transfer {
  from: string;
  to: string;
  amt: Nghin;
}

/** 'over' = tổng mức cố định lớn hơn tổng bill; 'gap' = ai cũng cố định nhưng cộng lại khác tổng bill. */
export type SplitProblem = 'over' | 'gap' | '';

export interface BillSplit {
  n: number;
  total: Nghin;
  /** Giá trị của một phần (hoặc mỗi người khi chia đều). */
  share: Nghin;
  /** Chia đều cho mọi người (không có mức cố định, hệ số đều 1). */
  even: boolean;
  rows: SplitRow[];
  sumFix: Nghin;
  bad: SplitProblem;
  transfers: Transfer[];
}
