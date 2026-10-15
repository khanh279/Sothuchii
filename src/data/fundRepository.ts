/**
 * Đọc/ghi Quỹ nhóm vào bộ nhớ máy, đúng định dạng PWA:
 *   quy_nhom_v1  ->  { funds: [{id,name}], contribs: [{id,fundId,title,date,people[],exp?}], expenses: [...], ... }
 *   (tiền: ĐỒNG)
 *
 * Nguyên tắc an toàn dữ liệu (giống expenseRepository):
 * 1. MỌI thao tác đi qua một hàng đợi duy nhất, nên các lần ghi liên tiếp không đè nhau.
 * 2. Đọc-sửa-ghi trên bản THÔ: trường lạ, bản ghi lạ và mục không hiểu được đều được giữ nguyên.
 *    (`normalizeFundData` chỉ dùng để HIỂN THỊ/TÍNH TOÁN, không bao giờ được ghi ngược vào kho.)
 * 3. Dữ liệu hỏng (JSON lỗi hoặc không phải đối tượng) làm thao tác ném StorageCorruptError và KHÔNG bị ghi đè.
 * 4. Không có thao tác nào xoá cả kho; chỉ xoá đúng quỹ / lần đóng / khoản chi được yêu cầu.
 */

import { StorageCorruptError, StorageKeys, loadJsonStrict, saveJsonStrict } from '@/data/storage';
import { newExpenseId } from '@/domain/expenses';
import { FUND_NAME_MAX, normalizeFundData } from '@/domain/funds';
import type { DateStr, ExpenseRef } from '@/types/expense';
import type { ContributionPerson, Fund, FundData } from '@/types/fund';
import type { Vnd } from '@/types/money';

type RawObject = Record<string, unknown>;

const isRecord = (value: unknown): value is RawObject => !!value && typeof value === 'object' && !Array.isArray(value);

/** Dữ liệu người dùng nhập sai (tên quỹ trống, thiếu quỹ...). Giao diện hiện thông báo từ `message`. */
export class FundInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FundInputError';
  }
}

// ───────────────────────── Hàng đợi tuần tự ─────────────────────────

let tail: Promise<unknown> = Promise.resolve();

/** Chạy lần lượt từng thao tác; một thao tác lỗi không làm tắc hàng đợi. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task);
  tail = run.catch(() => undefined);
  return run;
}

// ───────────────────────── Đọc bản thô ─────────────────────────

/** `undefined` = chưa từng lưu. Có dữ liệu nhưng không phải đối tượng thì coi là hỏng, không ghi đè. */
export async function readFundRaw(): Promise<RawObject | undefined> {
  const value = await loadJsonStrict<unknown>(StorageKeys.fund);
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new StorageCorruptError(StorageKeys.fund);
  return value;
}

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const LISTS = ['funds', 'contribs', 'expenses'] as const;

/** Đọc, sửa bản thô rồi ghi lại; mọi khóa không đụng tới được giữ nguyên. */
function mutate<T>(change: (raw: RawObject) => { next: RawObject; result: T }): Promise<T> {
  return serial(async () => {
    const raw = (await readFundRaw()) ?? {};
    // Một danh sách có mặt mà không phải mảng là dữ liệu lạ: không đoán, không ghi đè.
    for (const list of LISTS) if (raw[list] !== undefined && !Array.isArray(raw[list])) throw new StorageCorruptError(StorageKeys.fund);
    const { next, result } = change(raw);
    if (next === raw) return result; // không có gì thay đổi thì không ghi
    // PWA chỉ đọc kho khi cả `contribs` lẫn `expenses` là mảng, nên luôn bảo đảm ba mảng này tồn tại.
    await saveJsonStrict(StorageKeys.fund, { ...next, funds: arrayOf(next.funds), contribs: arrayOf(next.contribs), expenses: arrayOf(next.expenses) });
    return result;
  });
}

/** Quỹ mà một bản ghi thô thuộc về, giống `normalizeFundData`: trỏ tới quỹ không có thì tính là quỹ đầu tiên. */
function effectiveFundId(item: unknown, known: ReadonlySet<string>, firstId: string): string {
  const id = isRecord(item) ? String(item.fundId) : '';
  return known.has(id) ? id : firstId;
}

function fundIdsOf(raw: RawObject): { known: Set<string>; firstId: string } {
  const ids = arrayOf(raw.funds)
    .filter((item): item is RawObject => isRecord(item) && !!item.id)
    .map((item) => String(item.id));
  return { known: new Set(ids), firstId: ids[0] ?? '' };
}

const cleanFundName = (name: string) => String(name).trim().slice(0, FUND_NAME_MAX);

// ───────────────────────── Đọc ─────────────────────────

/** Dữ liệu đã chuẩn hoá để hiển thị. Chưa có dữ liệu thì trả về dữ liệu trống. */
export function loadFundData(): Promise<FundData> {
  return serial(async () => normalizeFundData(await readFundRaw()));
}

// ───────────────────────── Quỹ ─────────────────────────

export function createFund(name: string, now: number = Date.now()): Promise<Fund> {
  const clean = cleanFundName(name);
  if (!clean) return Promise.reject(new FundInputError('Nhập tên quỹ'));
  const fund: Fund = { id: `f_${newExpenseId(now)}`, name: clean };
  return mutate((raw) => ({ next: { ...raw, funds: [...arrayOf(raw.funds), fund] }, result: fund }));
}

/** Đổi tên quỹ, giữ nguyên các trường khác của quỹ. Trả về false nếu không tìm thấy quỹ. */
export function renameFund(id: string, name: string): Promise<boolean> {
  const clean = cleanFundName(name);
  if (!clean) return Promise.reject(new FundInputError('Nhập tên quỹ'));
  return mutate((raw) => {
    let found = false;
    const funds = arrayOf(raw.funds).map((item) => {
      if (!isRecord(item) || String(item.id) !== id) return item;
      found = true;
      return { ...item, name: clean };
    });
    return { next: found ? { ...raw, funds } : raw, result: found };
  });
}

/**
 * Xoá một quỹ cùng các lần đóng và khoản chi của nó (như PWA). Khoản chi cá nhân đã tạo từ các lần đóng ấy
 * không bị xoá ở đây: chúng thành khoản mồ côi và được `syncFundExpenses` dọn. Trả về false nếu không có quỹ.
 */
export function deleteFund(id: string): Promise<boolean> {
  return mutate((raw) => {
    const { known, firstId } = fundIdsOf(raw);
    if (!known.has(id)) return { next: raw, result: false };
    const keep = (item: unknown) => effectiveFundId(item, known, firstId) !== id;
    return {
      next: {
        ...raw,
        funds: arrayOf(raw.funds).filter((item) => !(isRecord(item) && String(item.id) === id)),
        contribs: arrayOf(raw.contribs).filter(keep),
        expenses: arrayOf(raw.expenses).filter(keep),
      },
      result: true,
    };
  });
}

// ───────────────────────── Lần đóng quỹ ─────────────────────────

export interface ContributionInput {
  /** Có `id` → sửa lần đóng đó; không có → thêm mới. */
  id?: string;
  fundId: string;
  title: string;
  date: DateStr;
  /** Số tiền đã là ĐỒNG (ô nhập nghìn đồng phải đổi bằng `parseNghinInput` trước). */
  people: readonly ContributionPerson[];
}

function requireFund(raw: RawObject, fundId: string) {
  if (!fundIdsOf(raw).known.has(fundId)) throw new FundInputError('Chọn quỹ trước khi lưu.');
}

/** Thêm hoặc sửa lần đóng quỹ. Sửa thì giữ nguyên `exp` và mọi trường lạ. Trả về id; null nếu `id` không tồn tại. */
export function saveContribution(input: ContributionInput, now: number = Date.now()): Promise<string | null> {
  return mutate((raw) => {
    requireFund(raw, input.fundId);
    const people = input.people.map((person) => ({ name: person.name, amount: person.amount }));
    const fields = { fundId: input.fundId, title: input.title, date: input.date, people };
    const contribs = arrayOf(raw.contribs);

    if (input.id === undefined) {
      const id = newExpenseId(now);
      return { next: { ...raw, contribs: [...contribs, { id, ...fields }] }, result: id };
    }
    let found = false;
    const updated = contribs.map((item) => {
      if (!isRecord(item) || String(item.id) !== input.id) return item;
      found = true;
      return { ...item, ...fields };
    });
    return { next: found ? { ...raw, contribs: updated } : raw, result: found ? input.id : null };
  });
}

export function deleteContribution(id: string): Promise<boolean> {
  return removeById('contribs', id);
}

// ───────────────────────── Khoản chi của quỹ ─────────────────────────

export interface FundExpenseInput {
  id?: string;
  fundId: string;
  title: string;
  date: DateStr;
  /** ĐỒNG, nhập trực tiếp (khác ô đóng quỹ nhập nghìn đồng). */
  amount: Vnd;
}

export function saveFundExpense(input: FundExpenseInput, now: number = Date.now()): Promise<string | null> {
  if (!Number.isFinite(input.amount) || Math.round(input.amount) <= 0) {
    return Promise.reject(new FundInputError('Nhập số tiền lớn hơn 0.'));
  }
  return mutate((raw) => {
    requireFund(raw, input.fundId);
    const fields = { fundId: input.fundId, title: input.title, date: input.date, amount: Math.round(input.amount) };
    const expenses = arrayOf(raw.expenses);

    if (input.id === undefined) {
      const id = newExpenseId(now);
      return { next: { ...raw, expenses: [...expenses, { id, ...fields }] }, result: id };
    }
    let found = false;
    const updated = expenses.map((item) => {
      if (!isRecord(item) || String(item.id) !== input.id) return item;
      found = true;
      return { ...item, ...fields };
    });
    return { next: found ? { ...raw, expenses: updated } : raw, result: found ? input.id : null };
  });
}

export function deleteFundExpense(id: string): Promise<boolean> {
  return removeById('expenses', id);
}

function removeById(list: 'contribs' | 'expenses', id: string): Promise<boolean> {
  return mutate((raw) => {
    const items = arrayOf(raw[list]);
    const rest = items.filter((item) => !(isRecord(item) && String(item.id) === id));
    return rest.length === items.length ? { next: raw, result: false } : { next: { ...raw, [list]: rest }, result: true };
  });
}

// ───────────────────────── Liên kết với chi tiêu cá nhân ─────────────────────────

export interface ContributionLink {
  contribId: string;
  /** Tham chiếu khoản chi cá nhân; `null` = bỏ liên kết. */
  exp: ExpenseRef | null;
}

/**
 * Ghi lại `exp` của các lần đóng quỹ (chỉ trường này). Lần đóng đã bị xoá trong lúc đồng bộ thì bỏ qua.
 * Trả về số liên kết thật sự được ghi.
 */
export function setContributionLinks(links: readonly ContributionLink[]): Promise<number> {
  return mutate((raw) => {
    const byId = new Map(links.map((link) => [link.contribId, link.exp]));
    let written = 0;
    const contribs = arrayOf(raw.contribs).map((item) => {
      if (!isRecord(item) || !byId.has(String(item.id))) return item;
      written++;
      const exp = byId.get(String(item.id));
      if (exp) return { ...item, exp: { m: exp.m, id: exp.id } };
      const { exp: _removed, ...rest } = item;
      void _removed;
      return rest;
    });
    return { next: written ? { ...raw, contribs } : raw, result: written };
  });
}
