/**
 * Quy tắc Chia bill (hàm thuần, không đọc/ghi lưu trữ, không phụ thuộc giao diện). Chuyển từ `mod-c` của PWA.
 *
 * ĐƠN VỊ: ĐỒNG (số nguyên), giống Chi tiêu cá nhân. Ngày là 'YYYY-MM-DD' theo giờ máy.
 *
 * Phần lập kế hoạch đồng bộ chi tiêu cá nhân `src:'cb'` (`planBillExpenseSync`) CHỈ lập kế hoạch;
 * việc thực hiện nằm ở tầng `data` (bước 4B). Chỉ đọc schema `v2`, không chạy migration cũ của PWA.
 */

import { DETAIL_MAX, MEMO_MAX } from '@/constants/categories';
import { FUND_OWNER_NAME, type LinkedExpenseSnapshot } from '@/domain/funds';
import type { Bill, BillPerson, BillSplit, SplitProblem, SplitRow, Transfer } from '@/types/bill';
import type { DateStr, ExpenseRef } from '@/types/expense';
import type { Vnd } from '@/types/money';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Tên người dùng tự nhập để chỉ chính mình; so khớp đúng chữ (phân biệt hoa thường), như PWA. */
export const BILL_OWNER_NAME = FUND_OWNER_NAME;
export const DEFAULT_BILL_TITLE = 'Không tên';
export const DEFAULT_BILL_CATEGORY = 'other';
export const MIN_BILL_PEOPLE = 2;
export const MAX_BILL_PEOPLE = 20;
/** Tên mặc định theo thứ tự dòng cho người không nhập tên (người đầu luôn là "Tôi"). */
const DEFAULT_LETTERS = 'ABCDEFGHIJKLMNOPQRST';
/** Sai số (đồng) dưới mức này coi là bằng nhau. */
const TOLERANCE = 50;

/** Tên mặc định của người thứ `index` (0 là "Tôi", 1 là "B", ...). */
export function defaultPersonName(index: number): string {
  return index === 0 ? BILL_OWNER_NAME : (DEFAULT_LETTERS[index] ?? '');
}

// ───────────────────────── Chia bill ─────────────────────────

/** Hệ số chia: thiếu hoặc rỗng là 1; số âm hoặc không hợp lệ cũng là 1 (hàm `Z`). */
export function weightOf(person: Pick<BillPerson, 'w'> | null | undefined): number {
  const raw = person ? person.w : 1;
  const value = raw == null || (raw as unknown) === '' ? 1 : +raw;
  return Number.isFinite(value) && value >= 0 ? value : 1;
}

/** Mức cố định (đồng); `null` nếu người này chia theo hệ số (hàm `dt`). */
export function fixedOf(person: Pick<BillPerson, 'fix'> | null | undefined): Vnd | null {
  if (!person || person.fix === undefined || person.fix === null || (person.fix as unknown) === '') return null;
  const value = +person.fix;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Các khoản chuyển gợi ý (hàm `Qn`). Làm tròn từng người đến đồng; nếu tổng lệch không quá số người
 * thì dồn phần dư vào người lệch nhiều nhất. Rồi ghép người còn thiếu lớn nhất với người nhận lại lớn nhất.
 */
export function suggestTransfers(rows: readonly Pick<SplitRow, 'name' | 'net'>[]): Transfer[] {
  const debtors: { name: string; amt: number }[] = [];
  const creditors: { name: string; amt: number }[] = [];
  const nets = rows.map((row) => Math.round(row.net));
  const sum = nets.reduce((acc, value) => acc + value, 0);

  let largest = -1;
  nets.forEach((value, index) => {
    if (largest < 0 || Math.abs(value) > Math.abs(nets[largest])) largest = index;
  });
  if (largest >= 0 && Math.abs(sum) <= rows.length) nets[largest] -= sum;

  rows.forEach((row, index) => {
    const value = nets[index];
    if (value < 0) debtors.push({ name: row.name, amt: -value });
    else if (value > 0) creditors.push({ name: row.name, amt: value });
  });
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amt, creditors[c].amt);
    if (amount > 0) transfers.push({ from: debtors[d].name, to: creditors[c].name, amt: amount });
    debtors[d].amt -= amount;
    creditors[c].amt -= amount;
    if (debtors[d].amt === 0) d++;
    if (creditors[c].amt === 0) c++;
  }
  return transfers;
}

/**
 * Tính phần của từng người (hàm `W`): người có mức cố định trả đúng mức đó, phần còn lại của tổng bill
 * chia cho những người còn lại theo hệ số (tổng hệ số 0 thì chia đều). `bad` báo lỗi mức cố định và khi đó
 * không có gợi ý chuyển tiền.
 */
export function computeSplit(people: readonly Pick<BillPerson, 'name' | 'paid' | 'w' | 'fix'>[]): BillSplit {
  const n = people.length;
  const total = people.reduce((sum, person) => sum + (+person.paid || 0), 0);

  let sumFix = 0;
  const floating: typeof people[number][] = [];
  for (const person of people) {
    const fixed = fixedOf(person);
    if (fixed === null) floating.push(person);
    else sumFix += fixed;
  }

  const remaining = total - sumFix;
  let weightSum = floating.reduce((sum, person) => sum + weightOf(person), 0);
  const equalWeights = weightSum <= 0;
  if (equalWeights) weightSum = floating.length;

  const even = floating.length === n && (equalWeights || people.every((person) => weightOf(person) === 1));
  const unit = weightSum ? remaining / weightSum : 0;
  const bad: SplitProblem = sumFix > total + TOLERANCE ? 'over' : !floating.length && Math.abs(remaining) > TOLERANCE ? 'gap' : '';

  const rows: SplitRow[] = people.map((person, index) => {
    const paid = +person.paid || 0;
    const fixed = fixedOf(person);
    const w = fixed !== null || equalWeights ? 1 : weightOf(person);
    const share = fixed !== null ? fixed : unit * w;
    return { index, name: person.name, paid, w, fixed: fixed !== null, share, net: paid - share };
  });

  return { n, total, share: unit, even, rows, sumFix, bad, transfers: bad ? [] : suggestTransfers(rows) };
}

/** Được phép lưu: có tiền, ít nhất 2 người và không lỗi mức cố định. */
export function canSaveBill(split: Pick<BillSplit, 'total' | 'n' | 'bad'>): boolean {
  return split.total > 0 && split.n >= MIN_BILL_PEOPLE && !split.bad;
}

/** Câu cảnh báo khi mức cố định sai (đúng chữ PWA); chuỗi rỗng nếu không lỗi. */
export function describeSplitProblem(split: Pick<BillSplit, 'bad' | 'sumFix' | 'total'>): string {
  const fixed = formatVnd(split.sumFix);
  const total = formatVnd(split.total);
  if (split.bad === 'over') return `Tổng mức cố định (${fixed}) lớn hơn tổng bill (${total}).`;
  if (split.bad === 'gap') return `Ai cũng trả mức cố định nhưng cộng lại (${fixed}) khác tổng bill (${total}).`;
  return '';
}

// ───────────────────────── Đọc dữ liệu v2 ─────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export interface NormalizeBillContext {
  today?: DateStr;
}

/**
 * Đọc dữ liệu thô `chiabill:v2:bills` thành danh sách an toàn để HIỂN THỊ và TÍNH (không migration):
 * bỏ mục không phải bill (thiếu id hoặc `people` không phải mảng), điền giá trị mặc định.
 * Kết quả không giữ trường lạ; khi ghi (4B) phải sửa trên bản thô, không ghi ngược kết quả này.
 */
export function normalizeBills(raw: unknown, context: NormalizeBillContext = {}): Bill[] {
  const today = context.today ?? todayStr();
  const bills: Bill[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isRecord(item) || !item.id || !Array.isArray(item.people)) continue;
    const people: BillPerson[] = item.people.map((entry) => {
      const p = isRecord(entry) ? entry : {};
      const person: BillPerson = { name: String(p.name ?? ''), paid: +(p.paid as number) || 0 };
      if (p.w !== undefined && p.w !== null && p.w !== '') person.w = +(p.w as number);
      if (p.fix !== undefined && p.fix !== null && p.fix !== '') person.fix = +(p.fix as number);
      return person;
    });
    const exp = isRecord(item.exp) && item.exp.m ? { m: String(item.exp.m), id: String(item.exp.id) } : undefined;
    const bill: Bill = {
      id: String(item.id),
      title: String(item.title || DEFAULT_BILL_TITLE),
      date: String(item.date || today),
      createdAt: +(item.createdAt as number) || 0,
      cat: String(item.cat || DEFAULT_BILL_CATEGORY),
      people,
    };
    if (exp) bill.exp = exp;
    bills.push(bill);
  }
  return bills;
}

// ───────────────────────── Đồng bộ sang chi tiêu cá nhân ─────────────────────────

/** Khoản chi cá nhân mà một bill cần có, đúng dạng `addExp` sẽ lưu (tiền ĐỒNG). */
export interface DesiredBillExpense {
  a: Vnd;
  c: string;
  n: string;
  d: DateStr;
  i: string;
  src: 'cb';
}

/**
 * Khoản chi cá nhân của một bill (phần `N()` của PWA): phần của "Tôi" = nhỏ hơn giữa số đã chi và phần phải trả,
 * làm tròn đồng. Không có khi bill lỗi mức cố định, không có người tên đúng "Tôi", hoặc phần đó làm tròn về 0.
 * Dòng chi tiết `i` có thêm "Trả trước …" khi "Tôi" đã chi ít hơn phần mình. `n` và `i` được cắt giống `addExp`
 * (80 và 120 ký tự) để so sánh với bản đã lưu luôn ổn định.
 */
export function desiredBillExpense(bill: Pick<Bill, 'people' | 'title' | 'date' | 'cat'>): DesiredBillExpense | null {
  const split = computeSplit(bill.people);
  if (split.bad) return null;
  const mine = split.rows.find((row) => row.name === BILL_OWNER_NAME);
  if (!mine) return null;
  const amount = Math.round(Math.min(mine.paid, mine.share));
  if (amount <= 0) return null;

  const date = String(bill.date);
  const parts = date.split('-');
  const dayMonth = parts.length === 3 ? `${parts[2]}/${parts[1]}` : date.slice(0, 5);
  const prepaid = mine.paid < mine.share - TOLERANCE ? `\nTrả trước ${formatVnd(mine.paid)}` : '';
  return {
    a: amount,
    c: bill.cat || DEFAULT_BILL_CATEGORY,
    n: (bill.title || DEFAULT_BILL_TITLE).slice(0, MEMO_MAX),
    d: date,
    i: `Chia bill ${dayMonth} · ${split.n} người${prepaid}`.slice(0, DETAIL_MAX),
    src: 'cb',
  };
}

/** Hành động đồng bộ; do tầng `data` thực hiện theo đúng thứ tự trả về. */
export type BillSyncAction =
  /** Bill chưa có khoản chi mà cần có: tạo mới và lưu tham chiếu vào `bill.exp`. */
  | { type: 'add'; billId: string; expense: DesiredBillExpense }
  /** Khoản liên kết lỗi thời hoặc mất: xoá `remove` (nếu có) rồi tạo mới và cập nhật `bill.exp`. */
  | { type: 'replace'; billId: string; remove: ExpenseRef | null; expense: DesiredBillExpense }
  /** Bill không còn cần khoản chi: xoá `remove` (nếu có) và bỏ `bill.exp`. */
  | { type: 'unlink'; billId: string; remove: ExpenseRef | null }
  /** Khoản `src:'cb'` không bill hay khoản trả nào trỏ tới: xoá. */
  | { type: 'delete-orphan'; remove: ExpenseRef };

const refKey = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;

function sameAsDesired(current: LinkedExpenseSnapshot, desired: DesiredBillExpense): boolean {
  return (
    current.a === desired.a &&
    current.c === desired.c &&
    current.n === desired.n &&
    current.d === desired.d &&
    (current.i || '') === desired.i
  );
}

/**
 * Lập kế hoạch đồng bộ chi tiêu cá nhân của các bill, HÀM THUẦN.
 *
 * - `lookup`: đọc khoản chi cá nhân theo tham chiếu (null nếu không còn).
 * - `cbRefs`: mọi khoản chi cá nhân mang `src:'cb'` (từ `listSrc('cb')`).
 * - `otherReferenced`: tham chiếu khoản `src:'cb'` đang được dữ liệu KHÁC dùng (khoản trả nợ ở Công nợ);
 *   không bao giờ bị coi là mồ côi.
 *
 * An toàn dữ liệu (chặt hơn PWA): chỉ XOÁ khoản chi mang `src:'cb'`. Nếu `bill.exp` trỏ tới khoản không có nhãn đó
 * (ví dụ khoản người dùng tự nhập), kế hoạch chỉ bỏ liên kết, không xoá. Khoản người dùng tự nhập và khoản `src:'quy'`
 * không nằm trong `cbRefs` nên không bao giờ bị xoá như khoản mồ côi.
 */
export function planBillExpenseSync(input: {
  bills: readonly Pick<Bill, 'id' | 'people' | 'title' | 'date' | 'cat' | 'exp'>[];
  lookup: (ref: ExpenseRef) => LinkedExpenseSnapshot | null;
  cbRefs: readonly ExpenseRef[];
  otherReferenced?: readonly ExpenseRef[];
}): BillSyncAction[] {
  const { bills, lookup, cbRefs, otherReferenced = [] } = input;
  const actions: BillSyncAction[] = [];

  for (const bill of bills) {
    const desired = desiredBillExpense(bill);
    const current = bill.exp ? lookup(bill.exp) : null;
    const removable = bill.exp && current && current.src === 'cb' ? bill.exp : null;

    if (desired) {
      if (current && sameAsDesired(current, desired)) continue;
      if (bill.exp) actions.push({ type: 'replace', billId: bill.id, remove: removable, expense: desired });
      else actions.push({ type: 'add', billId: bill.id, expense: desired });
    } else if (bill.exp) {
      actions.push({ type: 'unlink', billId: bill.id, remove: removable });
    }
  }

  const referenced = new Set<string>(otherReferenced.map(refKey));
  for (const bill of bills) if (bill.exp) referenced.add(refKey(bill.exp));
  const seen = new Set<string>();
  for (const ref of cbRefs) {
    const key = refKey(ref);
    if (referenced.has(key) || seen.has(key)) continue;
    seen.add(key);
    actions.push({ type: 'delete-orphan', remove: ref });
  }
  return actions;
}
