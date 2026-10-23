import type { Bill } from '@/types/bill';
import type { DateStr, ExpenseRef } from '@/types/expense';
import type { Vnd } from '@/types/money';

/**
 * Khoản thanh toán / chuyển tiền (Công nợ), đúng schema `v2` của PWA (khóa `chiabill:v2:pays`).
 * Tiền là ĐỒNG (dữ liệu cũ lưu nghìn đồng đã được chuyển một lần sang đồng). Dữ liệu cũ có thể thiếu nhiều trường nên hầu hết đều tuỳ chọn.
 */
export interface Pay {
  id: string;
  createdAt: number;
  date: DateStr;
  note: string;
  /** Người trả. "Tôi" (đúng chữ) là chính mình. */
  from: string;
  /** Người nhận. */
  to: string;
  amt: Vnd;
  /** 'vay' | 'billpay' | 'repay' | 'bill' | 'bt' (gộp nợ) | 'loan' | 'xfer' | 'other' | thiếu (dữ liệu cũ). */
  kind?: string;
  bill?: string;
  bills?: string[];
  /** Có mặt ở dữ liệu cũ của khoản vay; chỉ dùng để phân loại sổ. */
  item?: unknown;
  lbl?: string;
  /** Khoản "Đối soát" cũ (hiển thị là "Trả nợ"); không tạo mới. */
  ds?: unknown;
  /** Mã nhóm của một lần "Gộp nợ" (hai khoản `bt` cùng nhóm). */
  grp?: string;
  /** Sổ của khoản gộp nợ: 'loan' | 'bill'. */
  led?: string;
  /** Các khoản chi cá nhân `src:'cb'` được tạo từ khoản trả này. */
  exp?: ExpenseRef[];
}

/** Hai sổ nợ riêng biệt của PWA. */
export type Ledger = 'loan' | 'bill';

/** Một biến động nợ liên quan đến "Tôi". `v` > 0: người kia nợ tôi thêm; `v` < 0: tôi nợ thêm. */
export interface DebtEvent {
  led: Ledger;
  who: string;
  v: Vnd;
  /** 'bill' = từ gợi ý chuyển tiền của một bill; 'pay' = khoản trả; 'bt' = gộp nợ. */
  k: 'bill' | 'pay' | 'bt';
  bill?: Bill;
  pay?: Pay;
  d: DateStr;
  c: number;
}

/** Số dư với một người ở hai sổ (dấu: dương = người đó nợ tôi). */
export interface PersonDebt {
  name: string;
  loan: Vnd;
  bill: Vnd;
}

export interface PersonLedger extends PersonDebt {
  ev: Record<Ledger, DebtEvent[]>;
}

export interface AllDebts {
  list: PersonDebt[];
  /** Tổng người khác nợ tôi. */
  get: Vnd;
  /** Tổng tôi nợ. */
  owe: Vnd;
}

/** Một khoản chi cá nhân cần có từ khoản trả (tiền ĐỒNG), chưa có `src`. */
export interface PayAllocation {
  a: number;
  c: string;
  n: string;
  d: DateStr;
  i: string;
}
