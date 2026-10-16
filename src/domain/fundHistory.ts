/**
 * Lịch sử Quỹ nhóm và thẻ Quỹ ở Tổng quan (hàm thuần). Chuyển từ `B()` và `Ht()` của `mod-b` trong PWA.
 */

import { isInPeriod } from '@/domain/expenses';
import { DEFAULT_CONTRIBUTION_TITLE, contributionTotal, fundBalance, fundPeriodTotals, sortFundsByAbsBalance } from '@/domain/funds';
import type { DateStr, Period } from '@/types/expense';
import type { Fund, FundData } from '@/types/fund';
import type { Vnd } from '@/types/money';

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
  /** Dòng phụ: "N người đóng", "Chi quỹ", "Chi quỹ · A ứng", "Giao tiền ứng · A"... */
  meta: string;
  /** Người liên quan (người chi / nhận ứng / nhận thanh toán), nếu có. */
  person?: string;
  /** Hồ sơ ứng trước liên quan (để mở chi tiết hồ sơ). */
  advanceId?: string;
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

export function buildFundHistory(data: Pick<FundData, 'funds' | 'contribs' | 'expenses'> & Partial<Pick<FundData, 'advances' | 'txns'>>, filter: FundFilter, period: Period): FundHistory {
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
    });
  }
  for (const e of data.expenses) {
    if (!ids.has(e.fundId) || !isInPeriod(e.date, period)) continue;
    const meta = e.mode === 'personal' ? `Chi quỹ · ${e.payer || 'cá nhân'} ứng` : e.mode === 'advance' ? `Chi từ tiền ứng · ${e.payer || ''}`.trim() : 'Chi quỹ';
    entries.push({ kind: 'expense', id: e.id, date: e.date, title: e.title || DEFAULT_EXPENSE_TITLE, fundId: e.fundId, amount: e.amount, meta, person: e.payer, advanceId: e.advanceId });
  }
  for (const a of data.advances ?? []) {
    if (!ids.has(a.fundId) || !isInPeriod(a.date, period)) continue;
    entries.push({ kind: 'advance', id: a.id, date: a.date, title: a.title || 'Giao tiền ứng', fundId: a.fundId, amount: a.amount, meta: `Giao tiền ứng · ${a.person}`, person: a.person, advanceId: a.id });
  }
  for (const t of data.txns ?? []) {
    if (!ids.has(t.fundId) || !isInPeriod(t.date, period)) continue;
    entries.push({
      kind: t.kind === 'refund' ? 'refund' : 'payout',
      id: t.id,
      date: t.date,
      title: t.kind === 'refund' ? 'Hoàn tiền ứng' : `Thanh toán cho ${t.person}`,
      fundId: t.fundId,
      amount: t.amount,
      meta: t.kind === 'refund' ? `Hoàn tiền ứng · ${t.person}` : 'Quỹ trả cá nhân',
      person: t.person,
      advanceId: t.advanceId,
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
export function buildOverviewFundCard(
  data: Pick<FundData, 'funds' | 'contribs' | 'expenses'>,
  period: Period,
  showAll: boolean,
): OverviewFundCard {
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

/**
 * Giữ lại các dòng lịch sử liên quan tới MỘT người (người chi / nhận ứng / nhận thanh toán / hoàn tiền); bỏ ngày không còn dòng nào.
 * `person` rỗng = không lọc. Chỉ lọc hiển thị: không đổi dữ liệu, tổng thu / chi của `FundHistory` không bị ảnh hưởng.
 */
export function filterDaysByPerson(days: readonly FundHistoryDay[], person: string): FundHistoryDay[] {
  if (!person) return [...days];
  return days.map((day) => ({ ...day, entries: day.entries.filter((entry) => entry.person === person) })).filter((day) => day.entries.length > 0);
}
