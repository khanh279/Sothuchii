/**
 * Quy tắc Quỹ nhóm (hàm thuần, không đọc/ghi lưu trữ, không phụ thuộc giao diện). Chuyển từ `mod-b` của PWA.
 * Tiền luôn là ĐỒNG. Ngày là chuỗi 'YYYY-MM-DD' theo giờ máy.
 *
 * Phần quan trọng nhất là `planFundExpenseSync`: lập KẾ HOẠCH (chưa thực hiện) để đồng bộ phần tiền của
 * chính người dùng ("Tôi") trong mỗi lần đóng quỹ sang chi tiêu cá nhân. Phần thực hiện nằm ở tầng `data` (bước 3B).
 */

import { DETAIL_MAX, FUND_CATEGORY_ID, MEMO_MAX } from '@/constants/categories';
import { isInPeriod, newExpenseId } from '@/domain/expenses';
import type { DateStr, ExpenseRef, Period } from '@/types/expense';
import type { Advance, Contribution, Fund, FundData, FundExpense, FundTotals, FundTxn } from '@/types/fund';
import type { Vnd } from '@/types/money';
import { todayStr } from '@/utils/date';

/** Tên người dùng tự nhập khi đóng quỹ để chỉ phần của chính mình; so khớp sau khi cắt khoảng trắng, phân biệt hoa thường. */
export const FUND_OWNER_NAME = 'Tôi';
export const FUND_NAME_MAX = 40;
export const DEFAULT_FUND_NAME = 'Quỹ';
export const DEFAULT_CONTRIBUTION_TITLE = 'Đóng quỹ';
/** Tên quỹ do bản PWA rất cũ tự tạo; nếu còn rỗng thì bị bỏ khi đọc dữ liệu. */
const LEGACY_FUND_NAME = 'Quỹ chung';

// ───────────────────────── Chuẩn hoá dữ liệu đọc vào ─────────────────────────

export interface NormalizeContext {
  today?: DateStr;
  newId?: () => string;
}

/** Khoản chi cá nhân do Quỹ tạo (`src:'quy'`) chỉ đổi được từ Quỹ; sửa/xoá trực tiếp sẽ bị đồng bộ hoàn tác. */
export const FUND_LINKED_EDIT_MESSAGE = 'Khoản này được tạo từ Quỹ, vui lòng sửa tại Quỹ';
export const FUND_LINKED_DELETE_MESSAGE = 'Khoản này được tạo từ Quỹ, vui lòng xoá tại Quỹ';
export const isFundLinkedExpense = (expense: { src?: string }): boolean => expense.src === 'quy';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Đọc dữ liệu thô của `quy_nhom_v1` thành dạng an toàn để TÍNH TOÁN và HIỂN THỊ (hàm `Pt` + `at` của PWA):
 * bỏ mục hỏng, gán giá trị mặc định, lần đóng/chi trỏ tới quỹ không tồn tại thì gán về quỹ đầu tiên.
 *
 * Lưu ý cho tầng lưu trữ: kết quả này KHÔNG giữ trường lạ; khi ghi dữ liệu phải sửa trên bản thô,
 * không ghi đè bằng kết quả chuẩn hoá (để không làm mất dữ liệu mà PWA cũng không hiểu).
 */
export function normalizeFundData(raw: unknown, context: NormalizeContext = {}): FundData {
  const source = isRecord(raw) ? raw : {};
  const today = context.today ?? todayStr();
  const newId = context.newId ?? (() => newExpenseId(Date.now()));

  const funds: Fund[] = [];
  for (const item of Array.isArray(source.funds) ? source.funds : []) {
    if (isRecord(item) && item.id) {
      funds.push({ id: String(item.id), name: String(item.name || DEFAULT_FUND_NAME).slice(0, FUND_NAME_MAX) });
    }
  }
  const known = new Set(funds.map((fund) => fund.id));
  const firstId = funds.length ? funds[0].id : '';
  const fundOf = (value: unknown) => (known.has(String(value)) ? String(value) : firstId);

  const contribs: Contribution[] = [];
  for (const item of Array.isArray(source.contribs) ? source.contribs : []) {
    if (!isRecord(item) || !Array.isArray(item.people)) continue;
    const exp = isRecord(item.exp) && item.exp.m ? { m: String(item.exp.m), id: String(item.exp.id) } : undefined;
    const contribution: Contribution = {
      id: String(item.id || newId()),
      fundId: fundOf(item.fundId),
      title: String(item.title || ''),
      date: String(item.date || today),
      people: item.people.map((person) => {
        const p = isRecord(person) ? person : {};
        return { name: String(p.name || ''), amount: Number(p.amount) || 0 };
      }),
    };
    if (exp) contribution.exp = exp;
    contribs.push(contribution);
  }

  const expenses: FundExpense[] = [];
  for (const item of Array.isArray(source.expenses) ? source.expenses : []) {
    if (!isRecord(item)) continue;
    const expense: FundExpense = {
      id: String(item.id || newId()),
      fundId: fundOf(item.fundId),
      title: String(item.title || ''),
      date: String(item.date || today),
      amount: Number(item.amount) || 0,
    };
    // Trường mới (tuỳ chọn): dữ liệu cũ không có thì là khoản quỹ chi trực tiếp.
    if (item.mode === 'personal' || item.mode === 'advance') expense.mode = item.mode;
    if (typeof item.payer === 'string' && item.payer) expense.payer = item.payer;
    if (typeof item.advanceId === 'string' && item.advanceId) expense.advanceId = item.advanceId;
    const fundPart = Math.round(Number(item.fundPart) || 0);
    if (expense.mode === 'personal' && fundPart > 0 && fundPart < expense.amount) expense.fundPart = fundPart;
    expenses.push(expense);
  }

  const advances: Advance[] = [];
  for (const item of Array.isArray(source.advances) ? source.advances : []) {
    if (!isRecord(item) || !item.id) continue;
    advances.push({
      id: String(item.id),
      fundId: fundOf(item.fundId),
      person: String(item.person || ''),
      title: String(item.title || ''),
      date: String(item.date || today),
      amount: Math.max(0, Number(item.amount) || 0),
    });
  }

  const txns: FundTxn[] = [];
  for (const item of Array.isArray(source.fundTxns) ? source.fundTxns : []) {
    if (!isRecord(item) || !item.id || (item.kind !== 'refund' && item.kind !== 'payout')) continue;
    const txn: FundTxn = {
      id: String(item.id),
      fundId: fundOf(item.fundId),
      kind: item.kind,
      person: String(item.person || ''),
      amount: Math.max(0, Number(item.amount) || 0),
      date: String(item.date || today),
    };
    if (typeof item.advanceId === 'string' && item.advanceId) txn.advanceId = item.advanceId;
    if (typeof item.expenseId === 'string' && item.expenseId) txn.expenseId = item.expenseId;
    txns.push(txn);
  }

  const data: FundData = { funds, contribs, expenses, advances, txns, cur: known.has(String(source.cur)) ? String(source.cur) : firstId };
  if (funds.length === 1 && funds[0].name === LEGACY_FUND_NAME && !contribs.length && !expenses.length) data.funds = [];
  return data;
}

// ───────────────────────── Số dư và tổng ─────────────────────────

/** Tổng số tiền của một lần đóng quỹ (cộng mọi người). */
export function contributionTotal(contribution: Pick<Contribution, 'people'>): Vnd {
  return contribution.people.reduce((sum, person) => sum + person.amount, 0);
}

const inFund = (item: { fundId: string }, fundId: string | 'all') => fundId === 'all' || item.fundId === fundId;

/** Đã đóng / đã chi / số dư của một quỹ hoặc của tất cả quỹ (`'all'`). Số dư có thể âm. */
export function fundTotals(data: Pick<FundData, 'contribs' | 'expenses'>, fundId: string | 'all'): FundTotals {
  let totalIn = 0;
  let totalOut = 0;
  for (const contribution of data.contribs) if (inFund(contribution, fundId)) totalIn += contributionTotal(contribution);
  for (const expense of data.expenses) if (inFund(expense, fundId)) totalOut += expense.amount;
  return { in: totalIn, out: totalOut, bal: totalIn - totalOut };
}

/** Số dư của một quỹ. */
/**
 * Những người thuộc MỘT quỹ: người đã đóng quỹ, người từng nhận tiền ứng và người từng ứng tiền chi cho quỹ đó (không trùng, theo thứ tự xuất hiện; "Tôi" đứng đầu nếu có).
 * Dùng để chọn "Người chi" / "Người nhận ứng" chỉ trong số người của quỹ.
 */
export function fundMembers(data: Pick<FundData, 'contribs' | 'expenses' | 'advances'>, fundId: string): string[] {
  const seen = new Set<string>();
  const add = (name: string | undefined) => {
    const clean = (name ?? '').trim();
    if (clean) seen.add(clean);
  };
  for (const contrib of data.contribs) if (contrib.fundId === fundId) for (const person of contrib.people) add(person.name);
  for (const advance of data.advances ?? []) if (advance.fundId === fundId) add(advance.person);
  for (const expense of data.expenses) if (expense.fundId === fundId) add(expense.payer);
  const names = [...seen];
  return names.includes(FUND_OWNER_NAME) ? [FUND_OWNER_NAME, ...names.filter((name) => name !== FUND_OWNER_NAME)] : names;
}

export function fundBalance(data: Pick<FundData, 'contribs' | 'expenses'>, fundId: string | 'all'): Vnd {
  return fundTotals(data, fundId).bal;
}

/** Ngày phát sinh gần nhất (đóng quỹ hoặc chi quỹ) của một quỹ; `null` nếu quỹ chưa có giao dịch nào. Chỉ đọc, không đổi dữ liệu. */
export function fundLastActivity(data: Pick<FundData, 'contribs' | 'expenses'>, fundId: string): DateStr | null {
  let last: DateStr | null = null;
  for (const item of [...data.contribs, ...data.expenses]) {
    if (item.fundId === fundId && (last === null || item.date > last)) last = item.date;
  }
  return last;
}

/** Tổng đóng và chi của MỌI quỹ trong một kỳ xem (khung Quỹ ở Tổng quan). */
export function fundPeriodTotals(data: Pick<FundData, 'contribs' | 'expenses'>, period: Period): { in: Vnd; out: Vnd } {
  const totalIn = data.contribs.filter((c) => isInPeriod(c.date, period)).reduce((sum, c) => sum + contributionTotal(c), 0);
  const totalOut = data.expenses.filter((e) => isInPeriod(e.date, period)).reduce((sum, e) => sum + e.amount, 0);
  return { in: totalIn, out: totalOut };
}

export interface FundBalanceRow {
  fund: Fund;
  bal: Vnd;
}

/** Danh sách quỹ kèm số dư, xếp theo GIÁ TRỊ TUYỆT ĐỐI của số dư giảm dần (quỹ âm sâu vẫn nổi lên). Bằng nhau giữ thứ tự cũ. */
export function sortFundsByAbsBalance(data: Pick<FundData, 'funds' | 'contribs' | 'expenses'>): FundBalanceRow[] {
  return data.funds
    .map((fund) => ({ fund, bal: fundBalance(data, fund.id) }))
    .sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal));
}

// ───────────────────────── Đồng bộ sang chi tiêu cá nhân ─────────────────────────

/** Phần tiền của chính người dùng trong một lần đóng quỹ (tên "Tôi" sau khi cắt khoảng trắng, cộng nhiều dòng). */
export function ownContributionTotal(contribution: Pick<Contribution, 'people'>): Vnd {
  return contribution.people
    .filter((person) => String(person.name).trim() === FUND_OWNER_NAME)
    .reduce((sum, person) => sum + (Number(person.amount) || 0), 0);
}

/** Khoản chi cá nhân mà một lần đóng quỹ cần có, đúng dạng `addExp` sẽ lưu. */
export interface DesiredLinkedExpense {
  a: Vnd;
  c: typeof FUND_CATEGORY_ID;
  n: string;
  d: DateStr;
  i: string;
  src: 'quy';
}

/**
 * Khoản chi cá nhân tương ứng với phần của "Tôi" trong một lần đóng quỹ; `null` nếu phần đó bằng 0.
 * Nội dung `n` và `i` được cắt giống `addExp` (80 và 120 ký tự) để so sánh với bản đã lưu luôn ổn định;
 * nếu không cắt, tên quá dài sẽ khiến mỗi lần đồng bộ lại xoá rồi tạo lại khoản chi.
 */
export function desiredLinkedExpense(
  contribution: Pick<Contribution, 'people' | 'title' | 'date' | 'fundId'>,
  funds: readonly Fund[],
): DesiredLinkedExpense | null {
  const own = ownContributionTotal(contribution);
  const amount = Math.round(own);
  // Phần dưới 0,5 đồng làm tròn về 0: `addExp` từ chối số tiền 0, nên coi như không có phần của "Tôi".
  if (own <= 0 || amount <= 0) return null;
  const fund = funds.find((item) => item.id === contribution.fundId);
  return {
    a: amount,
    c: FUND_CATEGORY_ID,
    n: (contribution.title || DEFAULT_CONTRIBUTION_TITLE).slice(0, MEMO_MAX),
    d: String(contribution.date),
    i: (DEFAULT_CONTRIBUTION_TITLE + (fund ? ` · ${fund.name}` : '')).slice(0, DETAIL_MAX),
    src: 'quy',
  };
}

/** Ảnh chụp một khoản chi cá nhân đã lưu (lấy từ `getExp`). */
export interface LinkedExpenseSnapshot {
  a: Vnd;
  c: string;
  n: string;
  d: DateStr;
  i?: string;
  src?: string;
}

/** Hành động cần làm để đồng bộ; do tầng `data` thực hiện theo đúng thứ tự trả về. */
export type FundSyncAction =
  /** Lần đóng chưa có khoản chi liên kết mà cần có: tạo mới và lưu tham chiếu vào `contrib.exp`. */
  | { type: 'add'; contribId: string; expense: DesiredLinkedExpense }
  /** Khoản liên kết đã lỗi thời hoặc mất: xoá `remove` (nếu có) rồi tạo mới và cập nhật `contrib.exp`. */
  | { type: 'replace'; contribId: string; remove: ExpenseRef | null; expense: DesiredLinkedExpense }
  /** Lần đóng không còn phần của "Tôi": xoá `remove` (nếu có) và bỏ `contrib.exp`. */
  | { type: 'unlink'; contribId: string; remove: ExpenseRef | null }
  /** Khoản `src:'quy'` không lần đóng nào trỏ tới: xoá. */
  | { type: 'delete-orphan'; remove: ExpenseRef };

const refKey = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;

function sameAsDesired(current: LinkedExpenseSnapshot, desired: DesiredLinkedExpense): boolean {
  return (
    current.a === desired.a &&
    current.c === desired.c &&
    current.n === desired.n &&
    current.d === desired.d &&
    (current.i || '') === desired.i
  );
}

/**
 * Lập kế hoạch đồng bộ phần chi tiêu cá nhân của các lần đóng quỹ (hàm `wt` của PWA), HÀM THUẦN.
 *
 * - `lookup`: đọc khoản chi cá nhân theo tham chiếu (null nếu không còn).
 * - `quyRefs`: mọi khoản chi cá nhân hiện có mang `src:'quy'` (từ `listSrc('quy')`).
 *
 * An toàn dữ liệu (chặt hơn PWA): chỉ XOÁ khoản chi nếu nó mang `src:'quy'`. Nếu `contrib.exp` trỏ tới
 * một khoản không có nhãn đó (ví dụ khoản người dùng tự nhập), kế hoạch chỉ bỏ liên kết, không xoá khoản ấy.
 * Khoản chi người dùng tự nhập không bao giờ nằm trong `quyRefs` nên cũng không bao giờ bị xoá như khoản mồ côi.
 */
export function planFundExpenseSync(input: {
  data: Pick<FundData, 'funds' | 'contribs'>;
  lookup: (ref: ExpenseRef) => LinkedExpenseSnapshot | null;
  quyRefs: readonly ExpenseRef[];
}): FundSyncAction[] {
  const { data, lookup, quyRefs } = input;
  const actions: FundSyncAction[] = [];

  for (const contribution of data.contribs) {
    const desired = desiredLinkedExpense(contribution, data.funds);
    const current = contribution.exp ? lookup(contribution.exp) : null;
    const removable = contribution.exp && current && current.src === 'quy' ? contribution.exp : null;

    if (desired) {
      if (current && sameAsDesired(current, desired)) continue;
      if (contribution.exp) actions.push({ type: 'replace', contribId: contribution.id, remove: removable, expense: desired });
      else actions.push({ type: 'add', contribId: contribution.id, expense: desired });
    } else if (contribution.exp) {
      actions.push({ type: 'unlink', contribId: contribution.id, remove: removable });
    }
  }

  const referenced = new Set<string>();
  for (const contribution of data.contribs) if (contribution.exp) referenced.add(refKey(contribution.exp));
  const seen = new Set<string>();
  for (const ref of quyRefs) {
    const key = refKey(ref);
    if (referenced.has(key) || seen.has(key)) continue;
    seen.add(key);
    actions.push({ type: 'delete-orphan', remove: ref });
  }
  return actions;
}
