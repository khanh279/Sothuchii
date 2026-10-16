/**
 * Chi quỹ nâng cao (hàm thuần): quỹ chi trực tiếp, cá nhân ứng tiền chi trước, quỹ giao tiền ứng trước. Tiền là ĐỒNG (số nguyên).
 *
 * ── Ý nghĩa các chỉ tiêu (đối chiếu với logic có sẵn) ──
 * - Tổng chi thực tế = tổng mọi `FundExpense` (kể cả khoản cá nhân ứng và khoản chi từ tiền ứng). Mỗi khoản chi chỉ nằm trong DANH SÁCH CHI
 *   đúng một lần nên chỉ tính vào tổng chi đúng một lần. Giao tiền ứng, hoàn tiền và thanh toán cho cá nhân KHÔNG phải chi phí.
 * - SỐ DƯ QUỸ (`fundBalance` có sẵn) = tổng thu − tổng chi thực tế. GIỮ NGUYÊN công thức. Với mô hình mới nó là giá trị ròng của quỹ:
 *     số dư = tiền thực tế trong quỹ + tiền cá nhân đang giữ (chưa quyết toán) − quỹ nợ cá nhân     (`fundPosition` có test cho đẳng thức này).
 * - Tiền thực tế trong quỹ = thu − chi trực tiếp − tiền đã giao ứng + tiền đã hoàn − tiền quỹ đã trả cho cá nhân.
 * - Quỹ nợ cá nhân = phần cá nhân đã tự ứng chưa được trả + phần chi vượt tiền ứng chưa được trả thêm.
 * - Cá nhân đang giữ tiền ứng = tiền đã giao còn dư sau khi trừ chi thực tế và tiền đã hoàn.
 *
 * ── Hồ sơ ứng trước ──
 * Số dư của hồ sơ b = đã giao − đã chi − đã hoàn + đã trả thêm. b > 0: cá nhân còn giữ b; b < 0: quỹ nợ cá nhân −b; b = 0: không chênh lệch.
 * Trạng thái: chưa có chi / hoàn / trả nào = "Chưa quyết toán"; có phát sinh mà b ≠ 0 = "Quyết toán một phần"; có phát sinh và b = 0 = "Đã quyết toán".
 */

import { contributionTotal } from '@/domain/funds';
import type { Advance, FundData, FundExpense, FundTxn } from '@/types/fund';
import type { Vnd } from '@/types/money';

type Data = Pick<FundData, 'contribs' | 'expenses'> & Partial<Pick<FundData, 'advances' | 'txns'>>;

export type ExpenseKind = 'direct' | 'personal' | 'advance';
export const expenseKind = (expense: Pick<FundExpense, 'mode'>): ExpenseKind => expense.mode ?? 'direct';

const advancesOf = (data: Data): readonly Advance[] => data.advances ?? [];
const txnsOf = (data: Data): readonly FundTxn[] => data.txns ?? [];
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const inFund = (item: { fundId: string }, fundId: string | 'all') => fundId === 'all' || item.fundId === fundId;

// ───────────────────────── Hồ sơ ứng trước ─────────────────────────

export type AdvanceState = 'unsettled' | 'partial' | 'settled';
export const ADVANCE_STATE_LABEL: Record<AdvanceState, string> = { unsettled: 'Chưa quyết toán', partial: 'Quyết toán một phần', settled: 'Đã quyết toán' };

export interface AdvanceSummary {
  advance: Advance;
  /** Tổng quỹ đã giao. */
  given: Vnd;
  /** Tổng chi thực tế đã ghi nhận của hồ sơ. */
  spent: Vnd;
  /** Đã hoàn lại quỹ. */
  refunded: Vnd;
  /** Quỹ đã trả thêm cho cá nhân (phần chi vượt tiền ứng). */
  paidExtra: Vnd;
  /** given − spent − refunded + paidExtra (xem đầu file). */
  balance: Vnd;
  /** Cá nhân còn giữ (≥ 0) và quỹ còn nợ cá nhân (≥ 0) của hồ sơ này. */
  held: Vnd;
  owed: Vnd;
  state: AdvanceState;
  expenses: FundExpense[];
  txns: FundTxn[];
}

export function advanceSummary(data: Data, advance: Advance): AdvanceSummary {
  const expenses = data.expenses.filter((e) => e.advanceId === advance.id);
  const txns = txnsOf(data).filter((t) => t.advanceId === advance.id);
  const spent = sum(expenses.map((e) => e.amount));
  const refunded = sum(txns.filter((t) => t.kind === 'refund').map((t) => t.amount));
  const paidExtra = sum(txns.filter((t) => t.kind === 'payout').map((t) => t.amount));
  const balance = advance.amount - spent - refunded + paidExtra;
  const active = spent > 0 || refunded > 0 || paidExtra > 0;
  const state: AdvanceState = !active ? 'unsettled' : balance === 0 ? 'settled' : 'partial';
  return { advance, given: advance.amount, spent, refunded, paidExtra, balance, held: Math.max(0, balance), owed: Math.max(0, -balance), state, expenses, txns };
}

export function advanceById(data: Data, id: string): Advance | null {
  return advancesOf(data).find((a) => a.id === id) ?? null;
}

// ───────────────────────── Khoản cá nhân tự ứng ─────────────────────────

export type PayState = 'unpaid' | 'partial' | 'paid';
export const PAY_STATE_LABEL: Record<PayState, string> = { unpaid: 'Quỹ chưa trả', partial: 'Quỹ trả một phần', paid: 'Quỹ đã trả' };

export interface PersonalDebt {
  amount: Vnd;
  paid: Vnd;
  remaining: Vnd;
  state: PayState;
}

/** Công nợ của MỘT khoản chi cá nhân tự ứng (`mode: 'personal'`): số quỹ phải trả, đã trả (qua các giao dịch thanh toán gắn khoản chi) và còn nợ. */
export function personalDebt(data: Data, expense: FundExpense): PersonalDebt {
  const paid = sum(txnsOf(data).filter((t) => t.kind === 'payout' && t.expenseId === expense.id).map((t) => t.amount));
  const remaining = Math.max(0, expense.amount - paid);
  return { amount: expense.amount, paid, remaining, state: remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' };
}

// ───────────────────────── Vị thế quỹ ─────────────────────────

export interface FundPosition {
  /** Số dư quỹ theo công thức có sẵn: thu − tổng chi thực tế (= tiền thực tế + tiền cá nhân đang giữ − quỹ nợ cá nhân). */
  balance: Vnd;
  /** Tiền thực tế đang có trong quỹ. */
  cash: Vnd;
  /** Quỹ nợ cá nhân. */
  owed: Vnd;
  /** Tiền ứng cá nhân còn giữ. */
  held: Vnd;
  /** Tổng chi thực tế và phần quỹ chi trực tiếp. */
  spent: Vnd;
  directSpent: Vnd;
  /** Có phát sinh ứng trước / cá nhân ứng không (để ẩn các dòng phụ khi quỹ chỉ dùng chi trực tiếp). */
  advanced: boolean;
}

export function fundPosition(data: Data, fundId: string | 'all'): FundPosition {
  const income = sum(data.contribs.filter((c) => inFund(c, fundId)).map(contributionTotal));
  const expenses = data.expenses.filter((e) => inFund(e, fundId));
  const advances = advancesOf(data).filter((a) => inFund(a, fundId));
  const txns = txnsOf(data).filter((t) => inFund(t, fundId));
  const spent = sum(expenses.map((e) => e.amount));
  const directSpent = sum(expenses.filter((e) => expenseKind(e) === 'direct').map((e) => e.amount));
  const given = sum(advances.map((a) => a.amount));
  const refunds = sum(txns.filter((t) => t.kind === 'refund').map((t) => t.amount));
  const payouts = sum(txns.filter((t) => t.kind === 'payout').map((t) => t.amount));

  let held = 0;
  let owed = 0;
  for (const advance of advances) {
    const summary = advanceSummary(data, advance);
    held += summary.held;
    owed += summary.owed;
  }
  for (const expense of expenses) if (expenseKind(expense) === 'personal') owed += personalDebt(data, expense).remaining;

  return {
    balance: income - spent,
    cash: income - directSpent - given + refunds - payouts,
    owed,
    held,
    spent,
    directSpent,
    advanced: advances.length > 0 || expenses.some((e) => expenseKind(e) !== 'direct'),
  };
}

// ───────────────────────── Kiểm tra hợp lệ ─────────────────────────

export type Check = { ok: true; amount: Vnd } | { ok: false; message: string };

const positiveInt = (amount: number): number => (Number.isFinite(amount) ? Math.round(amount) : 0);

/** Hoàn tiền thừa: > 0 và không vượt số tiền cá nhân còn giữ của hồ sơ. */
export function checkRefund(data: Data, advanceId: string, amount: number): Check {
  const advance = advanceById(data, advanceId);
  if (!advance) return { ok: false, message: 'Không tìm thấy hồ sơ ứng trước.' };
  const value = positiveInt(amount);
  if (value <= 0) return { ok: false, message: 'Nhập số tiền lớn hơn 0.' };
  const { held } = advanceSummary(data, advance);
  if (value > held) return { ok: false, message: held > 0 ? 'Số tiền hoàn vượt số tiền ứng còn giữ.' : 'Hồ sơ này không còn tiền ứng để hoàn.' };
  return { ok: true, amount: value };
}

/** Quỹ trả tiền cho cá nhân: > 0 và không vượt số quỹ còn nợ (của khoản chi cá nhân ứng, hoặc của phần chi vượt tiền ứng). */
export function checkPayout(data: Data, target: { expenseId: string } | { advanceId: string }, amount: number): Check {
  const value = positiveInt(amount);
  if (value <= 0) return { ok: false, message: 'Nhập số tiền lớn hơn 0.' };
  let owed = 0;
  if ('expenseId' in target) {
    const expense = data.expenses.find((e) => e.id === target.expenseId);
    if (!expense || expenseKind(expense) !== 'personal') return { ok: false, message: 'Không tìm thấy khoản chi cá nhân ứng.' };
    owed = personalDebt(data, expense).remaining;
  } else {
    const advance = advanceById(data, target.advanceId);
    if (!advance) return { ok: false, message: 'Không tìm thấy hồ sơ ứng trước.' };
    owed = advanceSummary(data, advance).owed;
  }
  if (owed <= 0) return { ok: false, message: 'Không còn khoản nào quỹ phải trả.' };
  if (value > owed) return { ok: false, message: 'Số tiền vượt số quỹ còn nợ.' };
  return { ok: true, amount: value };
}
