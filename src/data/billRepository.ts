/**
 * Đọc/ghi Chia bill vào bộ nhớ máy, đúng định dạng PWA:
 *   chiabill:v2:bills  ->  [ { id, title, date, createdAt, cat, people: [{name, paid, w, fix?}], exp? }, ... ]  (tiền: NGHÌN đồng)
 *   chiabill:names     ->  [tên, ...]  (nhóm người của lần chia gần nhất)
 *
 * Nguyên tắc an toàn dữ liệu (giống fundRepository): một hàng đợi duy nhất; đọc-sửa-ghi trên bản THÔ nên trường lạ
 * và mục không hiểu được đều được giữ nguyên; dữ liệu hỏng (JSON lỗi, không phải mảng) làm thao tác ném
 * StorageCorruptError và KHÔNG bị ghi đè. Chỉ đọc schema `v2`, không chạy migration cũ của PWA.
 */

import { StorageCorruptError, StorageKeys, loadJsonStrict, saveJsonStrict } from '@/data/storage';
import { DEFAULT_BILL_CATEGORY, DEFAULT_BILL_TITLE, canSaveBill, computeSplit, normalizeBills } from '@/domain/bills';
import type { Bill, BillPerson } from '@/types/bill';
import type { DateStr, ExpenseRef } from '@/types/expense';
import { todayStr } from '@/utils/date';

type RawObject = Record<string, unknown>;

const isRecord = (value: unknown): value is RawObject => !!value && typeof value === 'object' && !Array.isArray(value);

/** Dữ liệu bill không hợp lệ để lưu (thiếu tiền, ít hơn 2 người, lỗi mức cố định). */
export class BillInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillInputError';
  }
}

// ───────────────────────── Hàng đợi tuần tự ─────────────────────────

let tail: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task);
  tail = run.catch(() => undefined);
  return run;
}

// ───────────────────────── Đọc bản thô ─────────────────────────

/** `undefined` = chưa từng lưu. Có dữ liệu mà không phải mảng thì coi là hỏng, không ghi đè. */
export async function readBillsRaw(): Promise<unknown[] | undefined> {
  const value = await loadJsonStrict<unknown>(StorageKeys.bills);
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new StorageCorruptError(StorageKeys.bills);
  return value;
}

/** Đọc-sửa-ghi trên bản thô. `next === current` nghĩa là không đổi gì nên không ghi. */
function mutate<T>(change: (bills: unknown[]) => { next: unknown[]; result: T }): Promise<T> {
  return serial(async () => {
    const current = (await readBillsRaw()) ?? [];
    const { next, result } = change(current);
    if (next !== current) await saveJsonStrict(StorageKeys.bills, next);
    return result;
  });
}

/** Mã bill: thời gian (base 36) + 5 ký tự ngẫu nhiên, như `st()` của PWA. */
export function newBillId(now: number = Date.now(), random: () => number = Math.random): string {
  return now.toString(36) + random().toString(36).slice(2, 7);
}

// ───────────────────────── Đọc ─────────────────────────

export function loadBills(): Promise<Bill[]> {
  return serial(async () => normalizeBills(await readBillsRaw()));
}

/** Nhóm người của lần chia gần nhất; chưa có hoặc sai kiểu thì rỗng. JSON hỏng vẫn ném lỗi. */
export function loadBillNames(): Promise<string[]> {
  return serial(async () => {
    const value = await loadJsonStrict<unknown>(StorageKeys.billNames);
    return Array.isArray(value) ? value.map((name) => String(name ?? '').trim()) : [];
  });
}

export function saveBillNames(names: readonly string[]): Promise<void> {
  return serial(() => saveJsonStrict(StorageKeys.billNames, names.map((name) => String(name ?? '').trim())));
}

// ───────────────────────── Ghi ─────────────────────────

export interface BillInput {
  /** Có `id` = sửa bill đó; không có = thêm mới. */
  id?: string;
  title: string;
  date?: DateStr;
  cat?: string;
  /** Tiền NGHÌN đồng. */
  people: readonly BillPerson[];
}

/** Người khi lưu: như `Cn()` của PWA — luôn có `w`, chỉ có `fix` khi người đó cố định mức. */
function storedPerson(person: BillPerson): BillPerson {
  const stored: BillPerson = { name: String(person.name), paid: +person.paid || 0, w: person.w ?? 1 };
  if (person.fix !== undefined && person.fix !== null && (person.fix as unknown) !== '') stored.fix = +person.fix;
  return stored;
}

/**
 * Thêm hoặc sửa bill. Sửa thì giữ nguyên `id`, `createdAt`, `exp` và mọi trường lạ.
 * Trả về id; `null` nếu sửa một bill không còn tồn tại. Ném BillInputError nếu bill không hợp lệ.
 */
export function saveBill(input: BillInput, now: number = Date.now()): Promise<string | null> {
  const split = computeSplit(input.people);
  if (!canSaveBill(split)) return Promise.reject(new BillInputError('Bill chưa hợp lệ: cần có tiền, ít nhất 2 người và mức cố định đúng.'));

  const fields = {
    title: (input.title || '').trim() || DEFAULT_BILL_TITLE,
    date: input.date || todayStr(),
    people: input.people.map(storedPerson),
    cat: input.cat || DEFAULT_BILL_CATEGORY,
  };
  return mutate((bills) => {
    if (input.id === undefined) {
      const id = newBillId(now);
      return { next: [...bills, { id, ...fields, createdAt: now }], result: id };
    }
    let found = false;
    const updated = bills.map((item) => {
      if (!isRecord(item) || String(item.id) !== input.id) return item;
      found = true;
      return { ...item, ...fields };
    });
    return found ? { next: updated, result: input.id } : { next: bills, result: null };
  });
}

/** Xoá bill. Khoản chi cá nhân đã tạo từ bill thành khoản mồ côi và được `syncBillExpenses` dọn. */
export function deleteBill(id: string): Promise<boolean> {
  return mutate((bills) => {
    const rest = bills.filter((item) => !(isRecord(item) && String(item.id) === id));
    return rest.length === bills.length ? { next: bills, result: false } : { next: rest, result: true };
  });
}

// ───────────────────────── Liên kết với chi tiêu cá nhân ─────────────────────────

export interface BillLink {
  billId: string;
  /** `null` = bỏ liên kết. */
  exp: ExpenseRef | null;
}

/** Ghi lại `exp` của các bill (chỉ trường này). Bill đã bị xoá trong lúc đồng bộ thì bỏ qua. Trả về số liên kết đã ghi. */
export function setBillLinks(links: readonly BillLink[]): Promise<number> {
  return mutate((bills) => {
    const byId = new Map(links.map((link) => [link.billId, link.exp]));
    let written = 0;
    const next = bills.map((item) => {
      if (!isRecord(item) || !byId.has(String(item.id))) return item;
      written++;
      const exp = byId.get(String(item.id));
      if (exp) return { ...item, exp: { m: exp.m, id: exp.id } };
      const { exp: _removed, ...rest } = item;
      void _removed;
      return rest;
    });
    return written ? { next, result: written } : { next: bills, result: 0 };
  });
}
