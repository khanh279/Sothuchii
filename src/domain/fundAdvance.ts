/**
 * Chi quỹ nâng cao (hàm thuần): quỹ chi trực tiếp, cá nhân ứng tiền chi trước, quỹ giao tiền ứng trước. Tiền là ĐỒNG (số nguyên).
 *
 * ── Ý nghĩa các chỉ tiêu (đối chiếu với logic có sẵn) ──
 * - Tổng chi thực tế = tổng mọi `FundExpense` (kể cả khoản cá nhân ứng và khoản chi từ tiền ứng). Mỗi khoản chi chỉ nằm trong DANH SÁCH CHI
 *   đúng một lần nên chỉ tính vào tổng chi đúng một lần. Giao tiền ứng, hoàn tiền và thanh toán cho cá nhân KHÔNG phải chi phí.
 * - SỐ CÒN LẠI THỰC TẾ của quỹ (`fundBalance`, `fundPosition().cash` và `.balance` bằng nhau) = tổng thu − tổng chi thực tế. Chỉ MỘT số dư: khoản quỹ chi trực tiếp, khoản cá nhân ứng chi (quỹ nợ) và
 *   phần cá nhân đã chi thực tế từ tiền quỹ giao đều làm số này giảm ngay khi ghi; tiền giao ứng chưa chi (cá nhân nợ quỹ) không tính là chi. Quỹ trả cá nhân và cá nhân hoàn tiền ứng chỉ đóng công nợ,
 *   KHÔNG đổi số còn lại. Số dư có thể âm; không có hạn chế ghi chi / giao ứng theo số dư.
 * - Quỹ nợ cá nhân = phần cá nhân đã tự ứng chưa được trả + phần chi vượt tiền ứng chưa được trả thêm.
 * - Cá nhân đang giữ tiền ứng = tiền đã giao còn dư sau khi trừ chi thực tế và tiền đã hoàn.
 *
 * ── Hồ sơ ứng trước ──
 * Số dư của hồ sơ b = đã giao − đã chi − đã hoàn + đã trả thêm. b > 0: cá nhân còn giữ b; b < 0: quỹ nợ cá nhân −b; b = 0: không chênh lệch.
 * Trạng thái: chưa có chi / hoàn / trả nào = "Chưa quyết toán"; có phát sinh mà b ≠ 0 = "Quyết toán một phần"; có phát sinh và b = 0 = "Đã quyết toán".
 */

import { contributionTotal } from '@/domain/funds';
import type { DateStr } from '@/types/expense';
import type { Advance, FundData, FundExpense, FundTxn } from '@/types/fund';
import type { Vnd } from '@/types/money';

type Data = Pick<FundData, 'contribs' | 'expenses'> & Partial<Pick<FundData, 'advances' | 'txns'>>;

export type ExpenseKind = 'direct' | 'personal' | 'advance';
export const expenseKind = (expense: Pick<FundExpense, 'mode'>): ExpenseKind => expense.mode ?? 'direct';

/** So sánh "ngày tăng dần, bằng ngày thì theo khoá" (cũ trước): dùng để chia tiền theo thứ tự thời gian. */
const byDateThenKey =
  <T extends { date: string }>(keyOf: (item: T) => string) =>
  (a: T, b: T): number =>
    a.date === b.date ? (keyOf(a) < keyOf(b) ? -1 : 1) : a.date < b.date ? -1 : 1;

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
  /** Hồ sơ do cá nhân ứng tiền (`advance.funder`): số quỹ còn nợ người ứng đó (amount − đã trả cho họ); 0 nếu quỹ tự giao ứng. */
  funderOwed: Vnd;
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
  // Khoản quỹ trả cho NGƯỜI ỨNG TIỀN (`funder`) thuộc công nợ với người đó, không phải phần chi vượt tiền ứng của người nhận.
  const funder = advance.funder?.trim();
  const payouts = txns.filter((t) => t.kind === 'payout');
  const funderPaid = funder ? sum(payouts.filter((t) => t.person.trim() === funder).map((t) => t.amount)) : 0;
  const paidExtra = sum(payouts.map((t) => t.amount)) - funderPaid;
  const balance = advance.amount - spent - refunded + paidExtra;
  const active = spent > 0 || refunded > 0 || paidExtra > 0;
  const state: AdvanceState = !active ? 'unsettled' : balance === 0 ? 'settled' : 'partial';
  const funderOwed = funder ? Math.max(0, advance.amount - funderPaid) : 0;
  return { advance, given: advance.amount, spent, refunded, paidExtra, balance, funderOwed, held: Math.max(0, balance), owed: Math.max(0, -balance), state, expenses, txns };
}

export function advanceById(data: Data, id: string): Advance | null {
  return advancesOf(data).find((a) => a.id === id) ?? null;
}

// ───────────────────────── Khoản cá nhân tự ứng ─────────────────────────

export type PayState = 'unpaid' | 'partial' | 'paid';
export const PAY_STATE_LABEL: Record<PayState, string> = { unpaid: 'Còn nợ', partial: 'Trả một phần', paid: 'Đã quyết toán' };

/**
 * Nhãn trạng thái của khoản cá nhân ứng (gọn, một dòng): đã trả hết → "Đã quyết toán"; trả một phần → "Đã thanh toán <số đã trả>" (khi biết `paid`);
 * chưa trả (hoặc không biết số đã trả) → "Còn nợ <số còn lại>".
 */
export function personalDebtLabel(state: PayState, remaining: number, format: (amount: number) => string, paid = 0): string {
  if (state === 'paid') return PAY_STATE_LABEL.paid;
  if (state === 'partial' && paid > 0) return `Đã thanh toán ${format(paid)}`;
  return `${PAY_STATE_LABEL.unpaid} ${format(remaining)}`;
}

/** Phần QUỸ chi trực tiếp của một khoản cá nhân ứng đã chia nguồn tiền (0 nếu không chia). Hợp lệ khi 0 < phần < tổng. */
export function expenseFundPart(expense: Pick<FundExpense, 'mode' | 'amount' | 'fundPart'>): Vnd {
  if (expense.mode !== 'personal') return 0;
  const part = Math.round(Number(expense.fundPart) || 0);
  return part > 0 && part < expense.amount ? part : 0;
}

export interface PersonalDebt {
  amount: Vnd;
  paid: Vnd;
  remaining: Vnd;
  state: PayState;
}

/**
 * Công nợ của MỘT khoản chi cá nhân tự ứng (`mode: 'personal'`): số quỹ phải trả, đã trả (qua các giao dịch thanh toán gắn khoản chi) và còn nợ.
 * Khoản đã chia nguồn tiền (`fundPart`) thì quỹ chỉ nợ phần cá nhân ứng (`amount − fundPart`); phần quỹ đã chi trực tiếp không phải nợ.
 */
export function personalDebt(data: Data, expense: FundExpense): PersonalDebt {
  const paid = sum(
    txnsOf(data)
      .filter((t) => t.kind === 'payout' && t.expenseId === expense.id)
      .map((t) => t.amount),
  );
  const owedTotal = expense.amount - expenseFundPart(expense);
  const remaining = Math.max(0, owedTotal - paid);
  return { amount: owedTotal, paid, remaining, state: remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' };
}

// ───────────────────────── Vị thế quỹ ─────────────────────────

export interface FundPosition {
  /** Số còn lại thực tế của quỹ: thu − tổng chi thực tế. */
  balance: Vnd;
  /** Bằng `balance` (một số dư duy nhất của quỹ). */
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
  const spent = sum(expenses.map((e) => e.amount));
  // Chi trực tiếp = các khoản chi trực tiếp + phần QUỸ chi của các khoản cá nhân ứng đã chia nguồn tiền (đây là tiền thật rời quỹ).
  const directSpent = sum(expenses.filter((e) => expenseKind(e) === 'direct').map((e) => e.amount)) + sum(expenses.map(expenseFundPart));

  let held = 0;
  let owed = 0;
  for (const advance of advances) {
    const summary = advanceSummary(data, advance);
    held += summary.held;
    owed += summary.owed + summary.funderOwed;
  }
  for (const expense of expenses) if (expenseKind(expense) === 'personal') owed += personalDebt(data, expense).remaining;

  return {
    balance: income - spent,
    cash: income - spent,
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

/** Quỹ trả tiền cho cá nhân (chỉ đóng công nợ, không đổi số còn lại của quỹ): > 0 và không vượt số quỹ còn nợ. */
export function checkPayout(data: Data, target: { expenseId: string } | { advanceId: string; toFunder?: boolean }, amount: number): Check {
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
    const summary = advanceSummary(data, advance);
    owed = target.toFunder ? summary.funderOwed : summary.owed;
  }
  if (owed <= 0) return { ok: false, message: 'Không còn khoản nào quỹ phải trả.' };
  if (value > owed) return { ok: false, message: 'Số tiền vượt số quỹ còn nợ.' };
  return { ok: true, amount: value };
}

// ───────────────────────── Công nợ quỹ theo người ─────────────────────────

export interface PersonFundBalance {
  person: string;
  /** Quỹ còn nợ người này (khoản cá nhân đã ứng chưa trả + phần chi vượt tiền ứng chưa trả thêm). */
  owed: Vnd;
  /** Người này còn giữ tiền ứng của quỹ (chưa chi hết / chưa hoàn). */
  held: Vnd;
}

/**
 * Công nợ quỹ gộp theo từng người (chỉ đọc, dùng đúng `personalDebt` và `advanceSummary` ở trên nên tổng các dòng bằng `fundPosition().owed / .held`).
 * Chỉ giữ người còn nợ hoặc còn giữ tiền; xếp theo số quỹ nợ giảm dần, rồi số đang giữ, rồi tên.
 */
export function fundPersonBalances(data: Data, fundId: string | 'all'): PersonFundBalance[] {
  const map = new Map<string, PersonFundBalance>();
  const row = (person: string): PersonFundBalance => {
    const name = person.trim();
    let entry = map.get(name);
    if (!entry) {
      entry = { person: name, owed: 0, held: 0 };
      map.set(name, entry);
    }
    return entry;
  };
  for (const expense of data.expenses) {
    if (!inFund(expense, fundId) || expenseKind(expense) !== 'personal') continue;
    row(expense.payer ?? '').owed += personalDebt(data, expense).remaining;
  }
  for (const advance of advancesOf(data)) {
    if (!inFund(advance, fundId)) continue;
    const summary = advanceSummary(data, advance);
    const entry = row(advance.person);
    entry.owed += summary.owed;
    entry.held += summary.held;
    if (advance.funder?.trim()) row(advance.funder).owed += summary.funderOwed;
  }
  return [...map.values()].filter((entry) => entry.owed > 0 || entry.held > 0).sort((a, b) => b.owed - a.owed || b.held - a.held || a.person.localeCompare(b.person));
}

/** Số tiền TỐI ĐA quỹ trả được cho một khoản nợ = số còn nợ (trả nợ không bị giới hạn bởi số còn lại của quỹ). */
export function maxPayoutNow(target: { remaining: Vnd }): Vnd {
  return Math.max(0, target.remaining);
}

// ───────────────────────── Khoản có thể thanh toán của một người ─────────────────────────

/** Một khoản thanh toán công nợ quỹ của MỘT người: quỹ trả cá nhân ('payout') hoặc cá nhân hoàn tiền ứng cho quỹ ('refund'). Số tiền là ĐỒNG. */
export interface FundPayTarget {
  /** Khoá ổn định trong danh sách của người (kind + khoản gốc). */
  key: string;
  kind: 'payout' | 'refund';
  fundId: string;
  expenseId?: string;
  advanceId?: string;
  /** true: khoản quỹ nợ NGƯỜI ỨNG TIỀN của hồ sơ (`advance.funder`), không phải nợ người nhận ứng. */
  toFunder?: boolean;
  /** Tên khoản gốc (nội dung khoản chi cá nhân ứng, hoặc tên hồ sơ ứng trước). */
  title: string;
  /** Số còn phải thanh toán (> 0): quỹ còn nợ ('payout') hoặc cá nhân còn giữ ('refund'). */
  remaining: Vnd;
  /** Ngày của khoản gốc (ngày khoản chi cá nhân ứng / ngày hồ sơ ứng trước): để thanh toán gộp ưu tiên khoản cũ nhất. */
  date: DateStr;
}

/**
 * Các khoản quỹ đang nợ / cá nhân đang giữ của MỘT người trong phạm vi quỹ, đúng từng khoản gốc để ghi thanh toán bằng `checkPayout` / `checkRefund`
 * (không có quy tắc phân bổ mới: mỗi giao dịch thanh toán luôn gắn với đúng một khoản chi cá nhân hoặc một hồ sơ ứng trước). Khớp
 * `fundPersonBalances`: tổng 'payout' = `owed`, tổng 'refund' = `held`. Không đụng tới khoản chi / thu thông thường.
 */
export function fundPersonTargets(data: Data, fundId: string | 'all', person: string): FundPayTarget[] {
  const who = person.trim();
  const targets: FundPayTarget[] = [];
  for (const expense of data.expenses) {
    if (!inFund(expense, fundId) || expenseKind(expense) !== 'personal' || (expense.payer ?? '').trim() !== who) continue;
    const remaining = personalDebt(data, expense).remaining;
    if (remaining > 0)
      targets.push({ key: `payout:e:${expense.id}`, kind: 'payout', fundId: expense.fundId, expenseId: expense.id, title: expense.title, remaining, date: expense.date });
  }
  for (const advance of advancesOf(data)) {
    if (!inFund(advance, fundId)) continue;
    if (advance.funder?.trim() === who) {
      const owedToFunder = advanceSummary(data, advance).funderOwed;
      if (owedToFunder > 0)
        targets.push({ key: `payout:f:${advance.id}`, kind: 'payout', fundId: advance.fundId, advanceId: advance.id, toFunder: true, title: advance.title, remaining: owedToFunder, date: advance.date });
    }
    if (advance.person.trim() !== who) continue;
    const summary = advanceSummary(data, advance);
    if (summary.owed > 0)
      targets.push({
        key: `payout:a:${advance.id}`,
        kind: 'payout',
        fundId: advance.fundId,
        advanceId: advance.id,
        title: advance.title,
        remaining: summary.owed,
        date: advance.date,
      });
    if (summary.held > 0)
      targets.push({
        key: `refund:a:${advance.id}`,
        kind: 'refund',
        fundId: advance.fundId,
        advanceId: advance.id,
        title: advance.title,
        remaining: summary.held,
        date: advance.date,
      });
  }
  return targets;
}

/**
 * CHI TỪ TIỀN ỨNG của MỘT người (nhiều lần giao ứng được coi là một khoản chung): chia số tiền chi vào các hồ sơ ứng của người đó theo thứ tự CŨ NHẤT trước, mới nhất sau, mỗi hồ sơ tối đa số tiền ứng còn giữ;
 * phần chi vượt tổng tiền ứng còn giữ được ghi vào hồ sơ MỚI NHẤT (thành quỹ nợ người đó, như khi chi vượt tiền ứng). Mỗi phần là một khoản chi gắn ĐÚNG một hồ sơ ứng như chi từ tiền ứng thường.
 * `fundId` = 'all' thì lấy hồ sơ của người đó ở mọi quỹ. Người chưa có hồ sơ ứng nào thì trả về danh sách rỗng.
 */
export function planAdvanceSpend(data: Data, fundId: string | 'all', person: string, amount: Vnd): { advanceId: string; fundId: string; amount: Vnd }[] {
  const who = person.trim();
  const advances = advancesOf(data)
    .filter((advance) => (fundId === 'all' || advance.fundId === fundId) && advance.person.trim() === who)
    .sort(byDateThenKey((item) => item.id));
  if (advances.length === 0 || !(amount > 0)) return [];
  const parts: { advanceId: string; fundId: string; amount: Vnd }[] = [];
  let left = amount;
  for (const advance of advances) {
    if (left <= 0) break;
    const part = Math.min(advanceSummary(data, advance).held, left);
    if (part <= 0) continue;
    parts.push({ advanceId: advance.id, fundId: advance.fundId, amount: part });
    left -= part;
  }
  if (left > 0) {
    const newest = advances[advances.length - 1];
    const existing = parts.find((part) => part.advanceId === newest.id);
    if (existing) existing.amount += left;
    else parts.push({ advanceId: newest.id, fundId: newest.fundId, amount: left });
  }
  return parts;
}

/**
 * HOÀN TIỀN ỨNG của MỘT người (các lần giao là một khoản chung): ƯU TIÊN hoàn hết các lần giao chưa chi đồng nào (số hoàn ≥ số còn giữ của lần đó), rồi trừ vào lần giao MỚI NHẤT còn giữ tiền trước, lùi dần về cũ (ngược với chi: cũ → mới), mỗi lần giao tối đa
 * số tiền còn giữ. Tổng còn giữ không đủ thì trả danh sách chỉ gồm phần hoàn được (người gọi so với `amount` để báo lỗi). `fundId` = 'all' thì lấy mọi quỹ.
 */
export function planAdvanceRefund(data: Data, fundId: string | 'all', person: string, amount: Vnd): { advanceId: string; amount: Vnd }[] {
  const who = person.trim();
  const advances = advancesOf(data)
    .filter((advance) => (fundId === 'all' || advance.fundId === fundId) && advance.person.trim() === who)
    .sort(byDateThenKey((item) => item.id))
    .reverse();
  const parts: { advanceId: string; amount: Vnd }[] = [];
  const taken = new Set<string>();
  let left = amount;
  // Ưu tiên 1: lần giao CHƯA CHI đồng nào mà số hoàn đủ trả hết số còn giữ → hoàn hết lần đó (nơi ghi sẽ xoá lần giao), mới → cũ.
  for (const advance of advances) {
    const summary = advanceSummary(data, advance);
    if (advance.funder || summary.spent !== 0 || summary.paidExtra !== 0 || summary.held <= 0 || summary.held > left) continue;
    parts.push({ advanceId: advance.id, amount: summary.held });
    taken.add(advance.id);
    left -= summary.held;
  }
  // Sau đó các lần giao còn lại, mới nhất → cũ nhất, mỗi lần tối đa số còn giữ.
  for (const advance of advances) {
    if (!(left > 0)) break;
    if (taken.has(advance.id)) continue;
    const part = Math.min(advanceSummary(data, advance).held, left);
    if (part <= 0) continue;
    parts.push({ advanceId: advance.id, amount: part });
    left -= part;
  }
  return parts;
}

/**
 * Khoản chi làm A chi VƯỢT số tiền được giao (để ghi chú dòng "Chi vượt tiền ứng"): xếp các khoản chi từ tiền ứng của người đó trong quỹ từ cũ đến mới, cộng dồn;
 * khoản mới nhất làm tổng chi vượt tổng đã giao thì được trả về. Không vượt thì `null`.
 */
export function overflowExpense(data: Data, fundId: string, person: string): FundExpense | null {
  const who = person.trim();
  const ids = new Set(
    advancesOf(data)
      .filter((advance) => advance.fundId === fundId && advance.person.trim() === who)
      .map((advance) => advance.id),
  );
  const given = sum(
    advancesOf(data)
      .filter((advance) => ids.has(advance.id))
      .map((advance) => advance.amount),
  );
  const spends = data.expenses.filter((expense) => expense.advanceId && ids.has(expense.advanceId)).sort(byDateThenKey((item) => item.id));
  let total = 0;
  let last: FundExpense | null = null;
  for (const expense of spends) {
    total += expense.amount;
    if (total > given) last = expense;
  }
  return last;
}

/** Kế hoạch phân bổ lại các khoản chi từ tiền ứng của một người (xem `planAdvanceReallocation`). */
export interface AdvanceReallocation {
  /** Khoản chi giữ lại nhưng đổi hồ sơ ứng / số tiền. */
  updates: { id: string; advanceId: string; amount: Vnd }[];
  /** Mã khoản chi (phần chi) không còn cần. */
  removes: string[];
  /** Phần chi mới cần thêm: sao chép nội dung, ngày, người chi từ khoản `anchorId`. */
  adds: { anchorId: string; advanceId: string; amount: Vnd }[];
}

/**
 * PHÂN BỔ LẠI chi từ tiền ứng của MỘT người trong một quỹ sau khi hồ sơ giao ứng đổi (sửa số tiền / ngày): các khoản chi cùng ngày, cùng nội dung được xem là MỘT khoản chi
 * (đã được chia thành nhiều phần khi ghi); xếp các khoản chi theo ngày (cũ trước), mỗi khoản lần lượt lấp đầy các lần giao CŨ NHẤT trước (mỗi lần giao tối đa số tiền giao);
 * phần vượt tổng tiền giao ghi vào lần giao MỚI NHẤT (thành quỹ nợ). Tổng tiền của từng khoản chi không đổi. Trả về `null` nếu không cần đổi gì (hoặc người đó chưa có lần giao nào).
 */
export function planAdvanceReallocation(data: Data, fundId: string, person: string): AdvanceReallocation | null {
  const who = person.trim();
  const advances = advancesOf(data)
    .filter((advance) => advance.fundId === fundId && advance.person.trim() === who)
    .sort(byDateThenKey((item) => item.id));
  if (advances.length === 0) return null;
  const ids = new Set(advances.map((advance) => advance.id));
  const pieces = data.expenses.filter((expense) => expenseKind(expense) === 'advance' && expense.advanceId && ids.has(expense.advanceId));
  if (pieces.length === 0) return null;

  const groups = new Map<string, FundExpense[]>();
  for (const piece of pieces) {
    const key = `${piece.date}|${piece.title}`;
    groups.set(key, [...(groups.get(key) ?? []), piece]);
  }
  const ordered = [...groups.values()].sort((a, b) => (a[0].date === b[0].date ? data.expenses.indexOf(a[0]) - data.expenses.indexOf(b[0]) : a[0].date < b[0].date ? -1 : 1));

  const capacity = new Map(advances.map((advance) => [advance.id, advance.amount] as const));
  const newest = advances[advances.length - 1].id;
  const result: AdvanceReallocation = { updates: [], removes: [], adds: [] };
  for (const group of ordered) {
    let left = sum(group.map((piece) => piece.amount));
    const parts: { advanceId: string; amount: Vnd }[] = [];
    for (const advance of advances) {
      if (left <= 0) break;
      const take = Math.min(capacity.get(advance.id) ?? 0, left);
      if (take <= 0) continue;
      parts.push({ advanceId: advance.id, amount: take });
      capacity.set(advance.id, (capacity.get(advance.id) ?? 0) - take);
      left -= take;
    }
    if (left > 0) {
      const last = parts.find((part) => part.advanceId === newest);
      if (last) last.amount += left;
      else parts.push({ advanceId: newest, amount: left });
    }
    parts.forEach((part, index) => {
      const piece = group[index];
      if (!piece) result.adds.push({ anchorId: group[0].id, advanceId: part.advanceId, amount: part.amount });
      else if (piece.advanceId !== part.advanceId || piece.amount !== part.amount) result.updates.push({ id: piece.id, advanceId: part.advanceId, amount: part.amount });
    });
    for (const extra of group.slice(parts.length)) result.removes.push(extra.id);
  }
  return result.updates.length || result.removes.length || result.adds.length ? result : null;
}

/**
 * THANH TOÁN GỘP các khoản quỹ nợ một người (trang "Quỹ nợ"): số tối đa trả được = tổng còn nợ của các khoản. Khoản hoàn tiền ứng ('refund') không thuộc phần này.
 */
export function combinedPayoutLimit(targets: readonly FundPayTarget[]): Vnd {
  return targets.filter((target) => target.kind === 'payout').reduce((total, target) => total + target.remaining, 0);
}

/**
 * Chia một số tiền thanh toán gộp cho từng khoản quỹ nợ: khoản CŨ NHẤT trả trước (ngày tăng dần, bằng ngày thì theo khoá), mỗi khoản trả tối đa số còn nợ của nó;
 * cứ thế lần lượt cho đến hết số tiền. Mỗi phần là một giao dịch trả gắn với ĐÚNG một khoản gốc như thanh toán thường (không có quy tắc mới cho từng giao dịch). Số tiền vượt mức trả được thì phần dư bị bỏ.
 */
export function planCombinedPayout(targets: readonly FundPayTarget[], amount: Vnd): { target: FundPayTarget; amount: Vnd }[] {
  const ordered = targets.filter((target) => target.kind === 'payout').sort(byDateThenKey((target) => target.key));
  const parts: { target: FundPayTarget; amount: Vnd }[] = [];
  let left = amount;
  for (const target of ordered) {
    if (left <= 0) break;
    const part = Math.min(target.remaining, left);
    if (part <= 0) continue;
    parts.push({ target, amount: part });
    left -= part;
  }
  return parts;
}

// ───────────────────────── Số còn lại và kiểm tra số tiền khi chi / giao tiền ─────────────────────────

/** Số còn lại thực tế của MỘT quỹ (thu − tổng chi); có thể âm. Không dùng để chặn chi hay giao tiền ứng. */
export function fundCash(data: Data, fundId: string): Vnd {
  return fundPosition(data, fundId).cash;
}

/** Chi quỹ (mọi hình thức): chỉ cần số tiền lớn hơn 0; số còn lại của quỹ KHÔNG chặn ghi chi (có thể âm). */
export function checkDirectSpend(amount: number): Check {
  const value = positiveInt(amount);
  if (value <= 0) return { ok: false, message: 'Nhập số tiền lớn hơn 0.' };
  return { ok: true, amount: value };
}

/** Giao tiền ứng: ≥ 0 (0 = giao việc chưa cấp tiền); không bị chặn bởi số còn lại của quỹ. */
export function checkAdvanceGive(amount: number): Check {
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: 'Số tiền giao không hợp lệ.' };
  return { ok: true, amount: positiveInt(amount) };
}
