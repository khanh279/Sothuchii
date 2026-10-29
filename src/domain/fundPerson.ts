/**
 * Chi tiết công nợ quỹ của MỘT người (hàm thuần, chỉ đọc): những khoản làm nên số "Quỹ nợ" / "Đang giữ ứng" của người đó, để hiện khi chọn người ở thẻ Công nợ quỹ.
 * - Quỹ giao ứng: các hồ sơ ứng trước giao cho người này (tiền quỹ đưa cho họ giữ).
 * - Chi từ tiền ứng: các khoản chi thực tế thuộc hồ sơ ứng của họ (trừ vào tiền ứng).
 * - Cá nhân ứng tiền túi chi: phần họ tự bỏ tiền chi cho quỹ (phần quỹ chi trực tiếp nếu có chia nguồn thì không tính).
 * - Hoàn tiền ứng: họ hoàn lại quỹ; Quỹ trả: quỹ trả lại họ.
 * Chỉ trình bày lại dữ liệu đã có; số "nợ / giữ" vẫn do `fundPersonBalances` tính.
 */

import { expenseFundPart, expenseKind } from '@/domain/fundAdvance';
import type { DateStr } from '@/types/expense';
import type { FundData } from '@/types/fund';
import type { Vnd } from '@/types/money';

export type PersonItemKind = 'advance' | 'advanceSpend' | 'personalSpend' | 'funded' | 'refund' | 'payout';

export const PERSON_ITEM_LABEL: Record<PersonItemKind, string> = {
  advance: 'Quỹ giao ứng',
  advanceSpend: 'Chi từ tiền ứng',
  personalSpend: 'Cá nhân ứng chi',
  funded: 'Cá nhân ứng cho người khác chi',
  refund: 'Hoàn tiền ứng',
  payout: 'Quỹ trả cá nhân',
};

/**
 * Hai phía của công nợ quỹ với một người, tách riêng để không chồng thông tin: 'owed' = QUỸ NỢ người đó (cá nhân ứng tiền túi chi, quỹ đã trả);
 * 'held' = người đó NỢ QUỸ, tức đang giữ tiền ứng của quỹ (quỹ giao ứng, chi từ tiền ứng, hoàn tiền ứng).
 */
export type PersonDebtSide = 'owed' | 'held';

export const PERSON_ITEM_SIDE: Record<PersonItemKind, PersonDebtSide> = {
  advance: 'held',
  advanceSpend: 'held',
  refund: 'held',
  personalSpend: 'owed',
  funded: 'owed',
  payout: 'owed',
};

export interface PersonFundItem {
  kind: PersonItemKind;
  id: string;
  title: string;
  date: DateStr;
  amount: Vnd;
}

export interface PersonFundDetail {
  items: PersonFundItem[];
  /** Tổng quỹ giao ứng cho người này. */
  given: Vnd;
  /** Tổng đã chi từ tiền ứng. */
  spentFromAdvance: Vnd;
  /** Tổng cá nhân tự ứng tiền túi chi cho quỹ. */
  spentPersonal: Vnd;
  refunded: Vnd;
  paid: Vnd;
}

type Data = Pick<FundData, 'expenses'> & Partial<Pick<FundData, 'advances' | 'txns'>>;

const inFund = (item: { fundId: string }, fundId: string | 'all') => fundId === 'all' || item.fundId === fundId;
const sum = (items: readonly PersonFundItem[], kind: PersonItemKind): Vnd => items.filter((item) => item.kind === kind).reduce((total, item) => total + item.amount, 0);

export function buildPersonFundDetail(data: Data, fundId: string | 'all', person: string): PersonFundDetail {
  const who = person.trim();
  const advances = (data.advances ?? []).filter((advance) => inFund(advance, fundId) && advance.person.trim() === who);
  const advanceIds = new Set(advances.map((advance) => advance.id));
  const items: PersonFundItem[] = [];

  // Người ứng tiền cho người khác chi: quỹ nợ họ đủ số tiền ứng (người nhận ứng giữ tiền như hồ sơ thường).
  for (const advance of data.advances ?? []) {
    if (inFund(advance, fundId) && advance.funder?.trim() === who) items.push({ kind: 'funded', id: advance.id, title: advance.title || `Ứng cho ${advance.person}`, date: advance.date, amount: advance.amount });
  }
  for (const advance of advances) items.push({ kind: 'advance', id: advance.id, title: advance.title || 'Giao tiền ứng', date: advance.date, amount: advance.amount });
  for (const expense of data.expenses) {
    if (!inFund(expense, fundId)) continue;
    const kind = expenseKind(expense);
    if (kind === 'advance' && expense.advanceId && advanceIds.has(expense.advanceId)) {
      items.push({ kind: 'advanceSpend', id: expense.id, title: expense.title || 'Chi quỹ', date: expense.date, amount: expense.amount });
    } else if (kind === 'personal' && (expense.payer ?? '').trim() === who) {
      items.push({ kind: 'personalSpend', id: expense.id, title: expense.title || 'Chi quỹ', date: expense.date, amount: expense.amount - expenseFundPart(expense) });
    }
  }
  for (const txn of data.txns ?? []) {
    if (!inFund(txn, fundId) || txn.person.trim() !== who) continue;
    items.push({ kind: txn.kind === 'refund' ? 'refund' : 'payout', id: txn.id, title: txn.kind === 'refund' ? 'Hoàn tiền ứng' : 'Quỹ trả', date: txn.date, amount: txn.amount });
  }
  items.sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));

  return {
    items,
    given: sum(items, 'advance'),
    spentFromAdvance: sum(items, 'advanceSpend'),
    spentPersonal: sum(items, 'personalSpend'),
    refunded: sum(items, 'refund'),
    paid: sum(items, 'payout'),
  };
}

/** Chỉ giữ phần của MỘT phía (quỹ nợ / nợ quỹ): các khoản của phía kia bị bỏ và tổng của chúng về 0, nên trang chi tiết không chồng thông tin hai phía của cùng một người. */
export function filterPersonDetailBySide(detail: PersonFundDetail, side: PersonDebtSide): PersonFundDetail {
  const items = detail.items.filter((item) => PERSON_ITEM_SIDE[item.kind] === side);
  return {
    items,
    given: sum(items, 'advance'),
    spentFromAdvance: sum(items, 'advanceSpend'),
    spentPersonal: sum(items, 'personalSpend'),
    refunded: sum(items, 'refund'),
    paid: sum(items, 'payout'),
  };
}
