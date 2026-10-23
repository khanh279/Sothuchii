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
import type { DateStr } from '@/types/expense';
import type { Advance, FundData, FundExpense, FundTxn } from '@/types/fund';
import type { Vnd } from '@/types/money';
import { formatVnd } from '@/utils/format';

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
  // Chi trực tiếp = các khoản chi trực tiếp + phần QUỸ chi của các khoản cá nhân ứng đã chia nguồn tiền (đây là tiền thật rời quỹ).
  const directSpent = sum(expenses.filter((e) => expenseKind(e) === 'direct').map((e) => e.amount)) + sum(expenses.map(expenseFundPart));
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

/** Thông báo khi quỹ hết tiền thực tế nên không thể quyết toán khoản nợ cho cá nhân. */
export const PAYOUT_NO_CASH_MESSAGE = 'Số dư của quỹ hiện không đủ để quyết toán khoản nợ.';

/** Quỹ trả tiền cho cá nhân: > 0, không vượt số quỹ còn nợ và không vượt tiền thực tế đang có trong quỹ (của khoản chi cá nhân ứng, hoặc của phần chi vượt tiền ứng). */
export function checkPayout(data: Data, target: { expenseId: string } | { advanceId: string }, amount: number): Check {
  const value = positiveInt(amount);
  if (value <= 0) return { ok: false, message: 'Nhập số tiền lớn hơn 0.' };
  let owed = 0;
  let fundId = '';
  if ('expenseId' in target) {
    const expense = data.expenses.find((e) => e.id === target.expenseId);
    if (!expense || expenseKind(expense) !== 'personal') return { ok: false, message: 'Không tìm thấy khoản chi cá nhân ứng.' };
    owed = personalDebt(data, expense).remaining;
    fundId = expense.fundId;
  } else {
    const advance = advanceById(data, target.advanceId);
    if (!advance) return { ok: false, message: 'Không tìm thấy hồ sơ ứng trước.' };
    owed = advanceSummary(data, advance).owed;
    fundId = advance.fundId;
  }
  if (owed <= 0) return { ok: false, message: 'Không còn khoản nào quỹ phải trả.' };
  if (value > owed) return { ok: false, message: 'Số tiền vượt số quỹ còn nợ.' };
  // Quỹ chỉ trả được bằng tiền thực tế đang có: hết tiền thì không thanh toán được, còn tiền thì tối đa bằng số dư.
  const cash = Math.max(0, fundCash(data, fundId));
  if (cash <= 0) return { ok: false, message: PAYOUT_NO_CASH_MESSAGE };
  if (value > cash) return { ok: false, message: `Số tiền vượt số dư quỹ. Tối đa có thể thanh toán: ${formatVnd(cash)}.` };
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
  }
  return [...map.values()].filter((entry) => entry.owed > 0 || entry.held > 0).sort((a, b) => b.owed - a.owed || b.held - a.held || a.person.localeCompare(b.person));
}

/**
 * Số tiền TỐI ĐA quỹ có thể trả ngay cho một khoản nợ: nhỏ hơn giữa số còn nợ và tiền thực tế trong quỹ của khoản đó (0 nếu quỹ hết tiền).
 * Chỉ dùng cho khoản 'payout'; hoàn tiền ứng ('refund') là tiền chảy VÀO quỹ nên không bị giới hạn bởi số dư.
 */
export function maxPayoutNow(data: Data, target: { fundId: string; remaining: Vnd }): Vnd {
  return Math.max(0, Math.min(target.remaining, fundCash(data, target.fundId)));
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
    if (!inFund(advance, fundId) || advance.person.trim() !== who) continue;
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
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
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
  const spends = data.expenses
    .filter((expense) => expense.advanceId && ids.has(expense.advanceId))
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  let total = 0;
  let last: FundExpense | null = null;
  for (const expense of spends) {
    total += expense.amount;
    if (total > given) last = expense;
  }
  return last;
}

/**
 * THANH TOÁN GỘP các khoản quỹ nợ một người (trang "Quỹ nợ"): số tối đa trả được ngay = với mỗi quỹ, nhỏ hơn giữa tổng còn nợ của quỹ đó và tiền THỰC TẾ trong quỹ (cộng các quỹ lại).
 * Khoản hoàn tiền ứng ('refund') không thuộc phần này.
 */
export function combinedPayoutLimit(data: Data, targets: readonly FundPayTarget[]): Vnd {
  const owedByFund = new Map<string, Vnd>();
  for (const target of targets) if (target.kind === 'payout') owedByFund.set(target.fundId, (owedByFund.get(target.fundId) ?? 0) + target.remaining);
  let total = 0;
  for (const [fundId, owed] of owedByFund) total += Math.max(0, Math.min(owed, fundCash(data, fundId)));
  return total;
}

/**
 * Chia một số tiền thanh toán gộp cho từng khoản quỹ nợ: khoản CŨ NHẤT trả trước (ngày tăng dần, bằng ngày thì theo khoá), mỗi khoản trả tối đa số còn nợ của nó, và mỗi quỹ không trả quá tiền thực tế của quỹ;
 * cứ thế lần lượt cho đến hết số tiền. Mỗi phần là một giao dịch trả gắn với ĐÚNG một khoản gốc như thanh toán thường (không có quy tắc mới cho từng giao dịch). Số tiền vượt mức trả được thì phần dư bị bỏ.
 */
export function planCombinedPayout(data: Data, targets: readonly FundPayTarget[], amount: Vnd): { target: FundPayTarget; amount: Vnd }[] {
  const cashLeft = new Map<string, Vnd>();
  const ordered = targets.filter((target) => target.kind === 'payout').sort((a, b) => (a.date === b.date ? (a.key < b.key ? -1 : 1) : a.date < b.date ? -1 : 1));
  const parts: { target: FundPayTarget; amount: Vnd }[] = [];
  let left = amount;
  for (const target of ordered) {
    if (left <= 0) break;
    if (!cashLeft.has(target.fundId)) cashLeft.set(target.fundId, Math.max(0, fundCash(data, target.fundId)));
    const part = Math.min(target.remaining, left, cashLeft.get(target.fundId) ?? 0);
    if (part <= 0) continue;
    parts.push({ target, amount: part });
    cashLeft.set(target.fundId, (cashLeft.get(target.fundId) ?? 0) - part);
    left -= part;
  }
  return parts;
}

// ───────────────────────── Quy tắc theo số dư khi chi / giao tiền ─────────────────────────

/** Cách chia nguồn tiền của một khoản chi lớn hơn số dư (quỹ chi phần có sẵn, cá nhân ứng phần còn thiếu). */
export interface SpendSplit {
  fundPart: Vnd;
  personalPart: Vnd;
}

/**
 * Khoản chi `amount` vượt tiền thực tế trong quỹ NHƯNG quỹ còn tiền (> 0): quỹ chi hết số đang có, cá nhân ứng phần còn lại.
 * Trả về null khi không cần / không thể chia (quỹ hết tiền → cá nhân ứng toàn bộ; quỹ đủ tiền → chi trực tiếp bình thường).
 */
export function planSpendSplit(data: Data, fundId: string, amount: number): SpendSplit | null {
  return splitByCash(fundCash(data, fundId), amount);
}

/** Như `planSpendSplit` nhưng từ số tiền thực tế trong quỹ đã biết (form dùng số đang hiển thị; tầng lưu trữ kiểm tra lại với số mới nhất). */
export function splitByCash(cash: Vnd, amount: number): SpendSplit | null {
  const value = positiveInt(amount);
  const available = Math.max(0, cash);
  if (value <= 0 || available <= 0 || value <= available) return null;
  return { fundPart: available, personalPart: value - available };
}

/** Thông báo khi chi trực tiếp từ quỹ vượt số dư. */
export const FUND_INSUFFICIENT_MESSAGE = 'Không thể ghi chi tiêu do số dư quỹ không đủ.';

/**
 * Số dư quỹ dùng để chặn chi / giao tiền = TIỀN THỰC TẾ đang có trong quỹ (`fundPosition().cash`): tiền đã giao ứng hoặc đã trả cá nhân không còn trong quỹ.
 * Khi quỹ chưa có ứng trước / thanh toán thì bằng số dư `thu − chi`. Giá trị âm (dữ liệu cũ đã chi vượt) coi là 0 khi tính phần còn có thể dùng.
 */
export function fundCash(data: Data, fundId: string): Vnd {
  return fundPosition(data, fundId).cash;
}

/** Hình thức chi mặc định khi mở form: quỹ hết tiền (≤ 0) thì "Cá nhân ứng chi", ngược lại chi trực tiếp. */
export function defaultExpenseKind(cash: Vnd): ExpenseKind {
  return cash <= 0 ? 'personal' : 'direct';
}

/**
 * Chi TRỰC TIẾP từ quỹ: số tiền không được vượt tiền thực tế trong quỹ. `excludeExpenseId` = đang sửa một khoản chi trực tiếp: số cũ của nó
 * được hoàn lại trước khi trừ số mới. Không đổi gì ở hình thức cá nhân ứng / chi từ tiền ứng (không lấy tiền khỏi quỹ lúc ghi).
 */
export function checkDirectSpend(data: Data, fundId: string, amount: number, excludeExpenseId?: string): Check {
  const value = positiveInt(amount);
  if (value <= 0) return { ok: false, message: 'Nhập số tiền lớn hơn 0.' };
  const previous = excludeExpenseId ? data.expenses.find((e) => e.id === excludeExpenseId && e.fundId === fundId && expenseKind(e) === 'direct') : undefined;
  const available = Math.max(0, fundCash(data, fundId) + (previous?.amount ?? 0));
  if (value > available) return { ok: false, message: FUND_INSUFFICIENT_MESSAGE };
  return { ok: true, amount: value };
}

/** Số tiền tối đa có thể giao ứng lúc này (đang sửa một hồ sơ thì tính lại cả số đã giao của nó). */
export function maxAdvanceGive(data: Data, fundId: string, excludeAdvanceId?: string): Vnd {
  const previous = excludeAdvanceId ? advancesOf(data).find((a) => a.id === excludeAdvanceId && a.fundId === fundId) : undefined;
  return Math.max(0, fundCash(data, fundId) + (previous?.amount ?? 0));
}

/** Giao tiền ứng: ≥ 0 (0 = giao việc chưa cấp tiền) và không vượt tiền thực tế trong quỹ. */
export function checkAdvanceGive(data: Data, fundId: string, amount: number, excludeAdvanceId?: string): Check {
  const value = positiveInt(amount);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: 'Số tiền giao không hợp lệ.' };
  const max = maxAdvanceGive(data, fundId, excludeAdvanceId);
  if (value > max) return { ok: false, message: `Số tiền giao vượt số dư quỹ. Tối đa có thể giao: ${formatVnd(max)}.` };
  return { ok: true, amount: value };
}
