/**
 * Lịch sử Quỹ nhóm và thẻ Quỹ ở Tổng quan (hàm thuần). Chuyển từ `B()` và `Ht()` của `mod-b` trong PWA.
 */

import { isInPeriod } from '@/domain/expenses';
import { advanceSummary, expenseFundPart, expenseKind, personalDebt } from '@/domain/fundAdvance';
import { DEFAULT_CONTRIBUTION_TITLE, contributionTotal, fundBalance, fundPeriodTotals, sortFundsByAbsBalance } from '@/domain/funds';
import type { DateStr, Period } from '@/types/expense';
import type { Fund, FundData } from '@/types/fund';
import type { Vnd } from '@/types/money';
import { formatVnDate } from '@/utils/date';

export const DEFAULT_EXPENSE_TITLE = 'Chi quỹ';
/** Thẻ Quỹ ở Tổng quan hiện tối đa 4 dòng; thu gọn thì hiện 3 dòng cộng nút "Xem thêm". */
export const OVERVIEW_FUND_LIMIT = 4;

export type FundFilter = 'all' | string;

/**
 * Loại dòng lịch sử. 'contribution' (thu) và 'expense' (chi thực tế) là hai loại duy nhất tính vào tổng thu / tổng chi; 'advance' (giao tiền ứng),
 * 'refund' (hoàn tiền ứng) và 'payout' (quỹ trả cho cá nhân) chỉ là dòng tiền của quỹ, KHÔNG tính vào tổng chi.
 */
export type FundHistoryKind = 'contribution' | 'expense' | 'advance' | 'refund' | 'payout';

export interface FundHistoryEntry {
  kind: FundHistoryKind;
  id: string;
  date: DateStr;
  title: string;
  fundId: string;
  amount: Vnd;
  /** Dòng phụ: "N người đóng", "Quỹ chi", "A ứng chi", "Giao A chi", "Giao A ứng"... */
  meta: string;
  /** Người liên quan (người chi / nhận ứng / nhận thanh toán), nếu có. */
  person?: string;
  /** Hồ sơ ứng trước liên quan (để mở chi tiết hồ sơ). */
  advanceId?: string;
  /** Chỉ với dòng giao ứng do CÁ NHÂN ứng tiền túi (quỹ hết tiền): người ứng tiền. Dòng này không làm đổi tiền mặt của quỹ. */
  funder?: string;
  /** Chỉ với dòng quỹ trả cá nhân: khoản chi cá nhân ứng gốc mà lần trả này thuộc về (để biết khoản đó đã thanh toán xong chưa). */
  expenseId?: string;
  /** Chỉ với dòng ĐÃ GỘP (`mergePayoutEntries`): mã mọi bản ghi cùng loại được gộp (giao dịch trả, khoản chi từ ứng hoặc lần giao ứng) và mọi khoản chi gốc của chúng. */
  mergedIds?: string[];
  expenseIds?: string[];
  /** Các thành viên đã đóng (chỉ với lần đóng quỹ), để lọc lịch sử theo thành viên. */
  people?: string[];
  /** Chỉ với khoản chi từ tiền ứng ("Quỹ giao A ứng chi"): để gộp các khoản cùng ngày, cùng người, cùng nội dung. */
  spendFromAdvance?: boolean;
  /** Chỉ với khoản chi đã chia nguồn tiền: phần quỹ chi và phần cá nhân ứng của CÙNG một khoản (tổng = `amount`). */
  split?: { fund: Vnd; personal: Vnd };
}

/**
 * Gộp, trong CÙNG MỘT NGÀY, các dòng quỹ trả cho cá nhân ứng chi có cùng người và cùng nội dung thành một dòng (cộng số tiền; giữ vị trí dòng đầu tiên); các lần quỹ GIAO tiền ứng
 * cho cùng một người ở cùng quỹ trong ngày cũng thành một dòng (giữ nội dung của lần đầu; trạng thái chi tính trên tổng); tương tự các khoản
 * "Quỹ giao A ứng chi" (chi từ tiền ứng) cùng ngày, cùng người, cùng nội dung — ví dụ một khoản chi chia vào hai lần giao ứng — được xem là MỘT khoản. Các dòng khác giữ nguyên.
 * Chỉ để hiển thị lịch sử: không đổi dữ liệu; `mergedIds` giữ mã các giao dịch được gộp để xoá đủ khi người dùng xoá dòng.
 */
export function mergePayoutEntries(days: readonly FundHistoryDay[]): FundHistoryDay[] {
  return days.map((day) => {
    const merged: FundHistoryEntry[] = [];
    const byKey = new Map<string, FundHistoryEntry>();
    for (const entry of day.entries) {
      if (entry.kind !== 'payout' && entry.kind !== 'advance' && !(entry.kind === 'expense' && entry.spendFromAdvance)) {
        merged.push(entry);
        continue;
      }
      const key = entry.kind === 'advance' ? `advance|${entry.fundId}|${entry.person ?? ''}` : `${entry.kind}|${entry.person ?? ''}|${entry.title}`;
      const existing = byKey.get(key);
      if (!existing) {
        const copy: FundHistoryEntry = { ...entry, mergedIds: [entry.id], expenseIds: entry.expenseId ? [entry.expenseId] : [] };
        byKey.set(key, copy);
        merged.push(copy);
      } else {
        existing.amount += entry.amount;
        existing.mergedIds?.push(entry.id);
        if (entry.expenseId && !existing.expenseIds?.includes(entry.expenseId)) existing.expenseIds?.push(entry.expenseId);
      }
    }
    return { ...day, entries: merged };
  });
}

export interface FundHistoryDay {
  date: DateStr;
  entries: FundHistoryEntry[];
}

export interface FundHistory {
  /** Bộ lọc đã hợp lệ hoá (quỹ không tồn tại thì về 'all'). */
  filter: FundFilter;
  /** Quỹ đang xem (1 quỹ khi lọc, mọi quỹ khi 'all'). */
  funds: Fund[];
  days: FundHistoryDay[];
  count: number;
  /** Tổng đóng / chi TRONG kỳ. */
  totalIn: Vnd;
  totalOut: Vnd;
  /** Số dư toàn thời gian của các quỹ đang xem (không phụ thuộc kỳ). */
  balance: Vnd;
  /** Hiện tên quỹ trước dòng phụ khi xem tất cả mà có nhiều quỹ. */
  showFundName: boolean;
}

/** Mới nhất trước; cùng ngày thì id lớn hơn trước (id sinh theo thời gian). */
function newestFirst(a: FundHistoryEntry, b: FundHistoryEntry): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function buildFundHistory(
  data: Pick<FundData, 'funds' | 'contribs' | 'expenses'> & Partial<Pick<FundData, 'advances' | 'txns'>>,
  filter: FundFilter,
  period: Period,
): FundHistory {
  const funds = filter === 'all' ? data.funds : data.funds.filter((fund) => fund.id === filter);
  const effective: FundFilter = filter !== 'all' && funds.length ? filter : 'all';
  const shown = effective === 'all' ? data.funds : funds;
  const ids = new Set(shown.map((fund) => fund.id));

  const entries: FundHistoryEntry[] = [];
  for (const c of data.contribs) {
    if (!ids.has(c.fundId) || !isInPeriod(c.date, period)) continue;
    entries.push({
      kind: 'contribution',
      id: c.id,
      date: c.date,
      title: c.title || DEFAULT_CONTRIBUTION_TITLE,
      fundId: c.fundId,
      amount: contributionTotal(c),
      meta: `${c.people.length} người đóng`,
      people: c.people.map((p) => String(p.name || '').trim()).filter(Boolean),
    });
  }
  for (const e of data.expenses) {
    if (!ids.has(e.fundId) || !isInPeriod(e.date, period)) continue;
    const meta = e.mode === 'personal' ? `${e.payer || 'Cá nhân'} ứng chi` : e.mode === 'advance' ? (e.payer ? `Giao ${e.payer} chi` : 'Giao cá nhân chi') : 'Quỹ chi';
    const fundPart = expenseFundPart(e);
    entries.push({
      kind: 'expense',
      id: e.id,
      date: e.date,
      title: e.title || DEFAULT_EXPENSE_TITLE,
      fundId: e.fundId,
      amount: e.amount,
      meta,
      person: e.payer,
      advanceId: e.advanceId,
      ...(e.mode === 'advance' ? { spendFromAdvance: true } : {}),
      ...(fundPart > 0 ? { split: { fund: fundPart, personal: e.amount - fundPart } } : {}),
    });
  }
  for (const a of data.advances ?? []) {
    if (!ids.has(a.fundId) || !isInPeriod(a.date, period)) continue;
    // Hoàn tiền ứng KHÔNG có dòng riêng: số đã hoàn được trừ thẳng vào số tiền của lần giao (lần giao hết sạch thì không còn dòng).
    const refunded = (data.txns ?? []).filter((t) => t.kind === 'refund' && t.advanceId === a.id).reduce((sum, t) => sum + t.amount, 0);
    const remaining = a.amount - refunded;
    if (refunded > 0 && remaining <= 0) continue;
    entries.push({
      kind: 'advance',
      id: a.id,
      date: a.date,
      title: a.title || 'Giao tiền ứng',
      fundId: a.fundId,
      amount: refunded > 0 ? remaining : a.amount,
      meta: a.funder ? `${a.funder} ứng cho ${a.person} chi` : `Giao ${a.person} ứng`,
      person: a.person,
      advanceId: a.id,
      ...(a.funder ? { funder: a.funder } : {}),
    });
  }
  for (const t of data.txns ?? []) {
    if (!ids.has(t.fundId) || !isInPeriod(t.date, period) || t.kind === 'refund') continue;
    // Quỹ trả cho cá nhân ứng chi: ghi theo khoản GỐC — tiêu đề (to) là nội dung khoản A đã chi (khoản chi hoặc hồ sơ ứng trước mà lần trả này thuộc về), ghi chú nhỏ "A ứng chi".
    const sourceItem = data.expenses.find((e) => e.id === t.expenseId) ?? (data.advances ?? []).find((a) => a.id === t.advanceId);
    const source = sourceItem?.title;
    entries.push({
      kind: 'payout',
      id: t.id,
      date: t.date,
      title: source?.trim() || `${t.person} ứng chi`,
      fundId: t.fundId,
      amount: t.amount,
      meta: `${t.person} ứng chi${sourceItem ? ` · ${formatVnDate(sourceItem.date)}` : ''}`,
      person: t.person,
      advanceId: t.advanceId,
      ...(t.expenseId ? { expenseId: t.expenseId } : {}),
    });
  }
  entries.sort(newestFirst);

  const days: FundHistoryDay[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }

  return {
    filter: effective,
    funds: shown,
    days,
    count: entries.length,
    totalIn: entries.filter((e) => e.kind === 'contribution').reduce((sum, e) => sum + e.amount, 0),
    totalOut: entries.filter((e) => e.kind === 'expense').reduce((sum, e) => sum + e.amount, 0),
    balance: shown.reduce((sum, fund) => sum + fundBalance(data, fund.id), 0),
    showFundName: effective === 'all' && data.funds.length > 1,
  };
}

/** Trạng thái quyết toán của các khoản cá nhân ứng chi: 'none' = không có khoản nào. */
export type SettlementState = 'none' | 'settled' | 'unsettled' | 'partial';

/** Toàn bộ đã quyết toán (còn nợ 0) → 'settled'; chưa quyết toán chút nào (còn nợ = tổng) → 'unsettled'; còn lại → 'partial'. */
export function settlementOf(amount: Vnd, remaining: Vnd): SettlementState {
  if (amount <= 0) return 'none';
  if (remaining <= 0) return 'settled';
  return remaining >= amount ? 'unsettled' : 'partial';
}

/** Chi tiết "Chi trong kỳ" của thẻ Tổng quan một quỹ (đồng, đều ≥ 0). */
export interface FundSpendBreakdown {
  /** Chi trực tiếp: các khoản quỹ chi trực tiếp. */
  direct: Vnd;
  /** Cá nhân ứng chi: các khoản cá nhân ứng tiền túi chi (số tiền khoản chi). */
  personal: Vnd;
  /** Giao cá nhân chi: các khoản cá nhân chi từ tiền quỹ giao (số đã chi thực tế). */
  advance: Vnd;
  /** Chi trong kỳ = chi trực tiếp + cá nhân ứng chi + giao cá nhân chi. */
  total: Vnd;
  /** Của các khoản cá nhân ứng chi trong kỳ: tổng phải trả cho cá nhân và số quỹ còn nợ (để ghi chú còn nợ / đã quyết toán / chưa quyết toán). */
  personalOwed: Vnd;
  personalRemaining: Vnd;
  /** Tổng TẤT CẢ tiền quỹ giao cá nhân trong kỳ (theo ngày giao, đã trừ tiền hoàn), kể cả lần giao chưa phát sinh chi. */
  given: Vnd;
}

/**
 * Các thành phần của "Chi trong kỳ", tính theo NGÀY CHI của từng khoản (cùng cách chia ba nhóm như bộ lọc ở Lịch sử quỹ): quỹ chi trực tiếp, cá nhân ứng chi, giao cá nhân chi (chi từ tiền giao).
 * `given` (tổng giao) tính riêng theo ngày giao của các lần giao. Chỉ đọc, không đổi dữ liệu.
 */
export function fundSpendBreakdown(data: Pick<FundData, 'funds' | 'expenses'> & Partial<Pick<FundData, 'advances' | 'txns' | 'contribs'>>, filter: FundFilter, period: Period): FundSpendBreakdown {
  const ids = new Set((filter === 'all' ? data.funds : data.funds.filter((fund) => fund.id === filter)).map((fund) => fund.id));
  const ctx = { contribs: data.contribs ?? [], expenses: data.expenses, advances: data.advances, txns: data.txns };
  let direct = 0;
  let personal = 0;
  let advance = 0;
  let personalOwed = 0;
  let personalRemaining = 0;
  for (const e of data.expenses) {
    if (!ids.has(e.fundId) || !isInPeriod(e.date, period)) continue;
    const kind = expenseKind(e);
    if (kind === 'direct') direct += e.amount;
    else if (kind === 'advance') advance += e.amount;
    else {
      personal += e.amount;
      const debt = personalDebt(ctx, e);
      personalOwed += debt.amount;
      personalRemaining += debt.remaining;
    }
  }
  let given = 0;
  for (const a of data.advances ?? []) {
    if (!ids.has(a.fundId) || !isInPeriod(a.date, period)) continue;
    given += a.amount - advanceSummary(ctx, a).refunded;
  }
  return { direct, personal, advance, total: direct + personal + advance, personalOwed, personalRemaining, given };
}

export interface OverviewFundRow {
  fund: Fund;
  bal: Vnd;
}

export interface OverviewFundCard {
  rows: OverviewFundRow[];
  /** Số quỹ chưa hiện (nút "Xem thêm N quỹ"). */
  hidden: number;
  /** Có nút "Thu gọn" (đang hiện tất cả mà có hơn 4 quỹ). */
  canCollapse: boolean;
  fundCount: number;
  totalIn: Vnd;
  totalOut: Vnd;
}

/** Thẻ Quỹ ở Tổng quan: quỹ xếp theo |số dư| giảm dần, tổng đóng/chi theo kỳ đang xem. */
export function buildOverviewFundCard(data: Pick<FundData, 'funds' | 'contribs' | 'expenses'>, period: Period, showAll: boolean): OverviewFundCard {
  const all = sortFundsByAbsBalance(data).map(({ fund, bal }) => ({ fund, bal }));
  const overflow = all.length > OVERVIEW_FUND_LIMIT;
  const rows = overflow && !showAll ? all.slice(0, OVERVIEW_FUND_LIMIT - 1) : all;
  const totals = fundPeriodTotals(data, period);
  return {
    rows,
    hidden: all.length - rows.length,
    canCollapse: overflow && showAll,
    fundCount: all.length,
    totalIn: totals.in,
    totalOut: totals.out,
  };
}

/** Dòng có liên quan tới `person`: người chi / nhận ứng / nhận thanh toán / hoàn tiền, hoặc một trong những người đóng của lần đóng quỹ. */
const involves = (entry: FundHistoryEntry, person: string): boolean => entry.person === person || !!entry.people?.includes(person);

/**
 * Giữ lại các dòng lịch sử liên quan tới MỘT thành viên (xem `involves`); bỏ ngày không còn dòng nào.
 * `person` rỗng = không lọc. Chỉ lọc hiển thị: không đổi dữ liệu, tổng thu / chi của `FundHistory` không bị ảnh hưởng.
 */
export function filterDaysByPerson(days: readonly FundHistoryDay[], person: string): FundHistoryDay[] {
  if (!person) return [...days];
  return days.map((day) => ({ ...day, entries: day.entries.filter((entry) => involves(entry, person)) })).filter((day) => day.entries.length > 0);
}

/** Loại khoản dùng để lọc Lịch sử quỹ; 'other' (lần giao tiền ứng) không hiện trong Lịch sử quỹ. */
export type FundHistoryCategory = 'contribution' | 'direct' | 'personal' | 'advanceSpend' | 'other';

/** Các loại lọc theo thứ tự hiển thị (sau chip "Tất cả"). */
export const FUND_HISTORY_CATEGORIES: readonly { value: FundHistoryCategory; label: string }[] = [
  { value: 'contribution', label: 'Thu quỹ' },
  { value: 'direct', label: 'Quỹ chi trực tiếp' },
  { value: 'personal', label: 'Cá nhân ứng chi' },
  { value: 'advanceSpend', label: 'Giao cá nhân chi' },
];

/**
 * Dòng lịch sử thuộc loại nào: đóng quỹ → Thu quỹ; khoản chi có người chi ứng tiền túi và dòng quỹ trả cá nhân → Cá nhân ứng chi; khoản cá nhân chi TỪ TIỀN QUỸ GIAO → Giao cá nhân chi
 * (chỉ phần đã chi thực tế, không phải cả lần giao); khoản chi còn lại → Quỹ chi trực tiếp. Lần giao tiền ứng ('advance') và hoàn tiền → 'other'.
 */
export function entryCategory(entry: Pick<FundHistoryEntry, 'kind' | 'person' | 'spendFromAdvance'>): FundHistoryCategory {
  if (entry.kind === 'contribution') return 'contribution';
  if (entry.kind === 'advance' || entry.kind === 'refund') return 'other';
  if (entry.kind === 'payout') return 'personal';
  if (entry.spendFromAdvance) return 'advanceSpend';
  return entry.person?.trim() ? 'personal' : 'direct';
}

/** Giữ lại các dòng thuộc một loại (`null` = không lọc); bỏ ngày không còn dòng nào. Chỉ lọc hiển thị. */
export function filterDaysByCategory(days: readonly FundHistoryDay[], category: FundHistoryCategory | null): FundHistoryDay[] {
  if (!category) return [...days];
  return days.map((day) => ({ ...day, entries: day.entries.filter((entry) => entryCategory(entry) === category) })).filter((day) => day.entries.length > 0);
}

/** Thành viên có mặt thật trong lịch sử đang xem (người đóng, người chi / nhận ứng / nhận thanh toán), theo tên, không trùng; không tạo người giả. */
export function historyMembers(days: readonly FundHistoryDay[]): string[] {
  const names = new Set<string>();
  for (const day of days) {
    for (const entry of day.entries) {
      if (entry.person?.trim()) names.add(entry.person.trim());
      for (const name of entry.people ?? []) names.add(name);
    }
  }
  return [...names].sort((x, y) => x.localeCompare(y));
}

