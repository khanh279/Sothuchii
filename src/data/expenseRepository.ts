/**
 * Đọc/ghi chi tiêu cá nhân vào bộ nhớ máy, đúng định dạng PWA:
 *   sct:m:YYYY-MM  ->  { [id]: { a, c, n, d, t, i?, src?, ... } }   (a: đồng)
 *   sct:settings   ->  { budget, budgets, cats }
 *
 * Nguyên tắc an toàn dữ liệu:
 * 1. MỌI thao tác đi qua một hàng đợi duy nhất, nên các lần ghi liên tiếp không đè nhau.
 * 2. Đọc-sửa-ghi trên bản THÔ: mọi trường lạ và mọi bản ghi không hiểu được đều được giữ nguyên.
 * 3. Dữ liệu hỏng (JSON lỗi) làm thao tác ném StorageCorruptError và KHÔNG bị ghi đè.
 * 4. Chuyển tháng ghi tháng mới trước rồi mới bỏ khỏi tháng cũ, trong một lệnh multiSet:
 *    nếu lỗi giữa chừng thì tệ nhất là bản ghi xuất hiện ở cả hai tháng, không bao giờ mất.
 */

import { normalizePhotoIds } from '@/domain/photos';
import {
  StorageCorruptError,
  StorageKeys,
  listKeys,
  loadJsonStrict,
  saveJsonStrict,
  saveManyJsonStrict,
} from '@/data/storage';
import { EMPTY_SETTINGS, newExpenseId, normalizeSettings } from '@/domain/expenses';
import type { Expense, ExpenseRef, ExpenseSettings, ExpenseWithId, MonthKey } from '@/types/expense';
import { isValidDateStr, isValidMonthKey, monthOf } from '@/utils/date';

type RawEntry = Record<string, unknown>;
type RawMonth = Record<string, unknown>;

const monthKeyOf = (month: MonthKey) => StorageKeys.expenseMonthPrefix + month;

// ───────────────────────── Hàng đợi tuần tự ─────────────────────────

let tail: Promise<unknown> = Promise.resolve();

/** Chạy lần lượt từng thao tác; một thao tác lỗi không làm tắc hàng đợi. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task);
  tail = run.catch(() => undefined);
  return run;
}

// ───────────────────────── Đọc bản thô ─────────────────────────

async function readMonthRaw(month: MonthKey): Promise<RawMonth> {
  const value = await loadJsonStrict<unknown>(monthKeyOf(month));
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageCorruptError(monthKeyOf(month));
  }
  return value as RawMonth;
}

/** Bản ghi PWA coi là hợp lệ: là đối tượng và `a` là số (hàm `nt`). */
function isRawExpense(value: unknown): value is RawEntry {
  return !!value && typeof value === 'object' && typeof (value as RawEntry).a === 'number';
}

/** Chuyển bản thô thành `ExpenseWithId` an toàn để hiển thị, không sửa bản thô. */
function toExpense(month: MonthKey, id: string, raw: RawEntry): ExpenseWithId {
  const d = typeof raw.d === 'string' && isValidDateStr(raw.d) ? raw.d : `${month}-01`;
  const expense: ExpenseWithId = {
    id,
    a: raw.a as number,
    c: typeof raw.c === 'string' ? raw.c : 'other',
    n: typeof raw.n === 'string' ? raw.n : '',
    d,
    t: Number(raw.t) || 0,
  };
  if (typeof raw.i === 'string') expense.i = raw.i;
  if (typeof raw.src === 'string') expense.src = raw.src;
  const ph = normalizePhotoIds(raw.ph);
  if (ph) expense.ph = ph;
  return expense;
}

// ───────────────────────── Đọc ─────────────────────────

/** Các tháng đã có khóa lưu (kể cả tháng rỗng, như PWA), sắp tăng dần. */
export function listMonthKeys(): Promise<MonthKey[]> {
  return serial(async () => {
    const prefix = StorageKeys.expenseMonthPrefix;
    return (await listKeys())
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .filter(isValidMonthKey)
      .sort();
  });
}

export function loadMonth(month: MonthKey): Promise<ExpenseWithId[]> {
  return serial(async () => {
    const raw = await readMonthRaw(month);
    return Object.entries(raw)
      .filter(([, value]) => isRawExpense(value))
      .map(([id, value]) => toExpense(month, id, value as RawEntry));
  });
}

export async function loadMonths(months: readonly MonthKey[]): Promise<ExpenseWithId[]> {
  const lists = await Promise.all(months.map((month) => loadMonth(month)));
  return lists.flat();
}

export function getExpense(ref: ExpenseRef): Promise<ExpenseWithId | null> {
  return serial(async () => {
    const entry = (await readMonthRaw(ref.m))[ref.id];
    return isRawExpense(entry) ? toExpense(ref.m, ref.id, entry) : null;
  });
}

// ───────────────────────── Ghi ─────────────────────────

/** Trường được phép sửa từ form; `t`, `i`, `src` và trường lạ luôn được giữ nguyên. */
export type ExpensePatch = Partial<Pick<Expense, 'a' | 'c' | 'n' | 'd' | 'ph'>>;

/** Id đã tồn tại trong tháng: không ghi đè để tránh mất khoản chi cũ. */
export class ExpenseIdExistsError extends Error {
  constructor(id: string) {
    super(`Khoản chi "${id}" đã tồn tại.`);
    this.name = 'ExpenseIdExistsError';
  }
}

/** Thêm khoản chi mới (nhận cả `i`, `src`). Id do người gọi cung cấp để dễ kiểm thử. */
export function createExpense(id: string, expense: Expense): Promise<ExpenseRef> {
  return serial(async () => {
    const month = monthOf(expense.d);
    const data = await readMonthRaw(month);
    if (id in data) throw new ExpenseIdExistsError(id);
    await saveJsonStrict(monthKeyOf(month), { ...data, [id]: { ...expense } });
    return { m: month, id };
  });
}

/**
 * Thêm khoản chi và tự sinh id (thời gian + 4 ký tự ngẫu nhiên). Nếu id trùng (rất hiếm)
 * thì thử id khác, không bao giờ ghi đè khoản cũ.
 */
export async function addExpense(expense: Expense, now: number = Date.now()): Promise<ExpenseRef> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await createExpense(newExpenseId(now), expense);
    } catch (error) {
      if (!(error instanceof ExpenseIdExistsError) || attempt >= 9) throw error;
    }
  }
}

/**
 * Sửa khoản chi. Giữ nguyên mọi trường không có trong `patch`. Đổi ngày sang tháng khác
 * thì chuyển bản ghi (cùng id) sang tháng mới. Trả về tham chiếu mới, hoặc null nếu không tìm thấy.
 */
export function updateExpense(ref: ExpenseRef, patch: ExpensePatch): Promise<ExpenseRef | null> {
  return serial(async () => {
    const oldData = await readMonthRaw(ref.m);
    const existing = oldData[ref.id];
    if (!isRawExpense(existing)) return null;

    const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    const merged = { ...existing, ...definedPatch };
    const newMonth = typeof merged.d === 'string' ? monthOf(merged.d) : ref.m;

    if (newMonth === ref.m) {
      await saveJsonStrict(monthKeyOf(ref.m), { ...oldData, [ref.id]: merged });
      return ref;
    }

    const newData = await readMonthRaw(newMonth);
    const { [ref.id]: _moved, ...oldRest } = oldData;
    void _moved;
    await saveManyJsonStrict([
      [monthKeyOf(newMonth), { ...newData, [ref.id]: merged }], // ghi tháng mới TRƯỚC
      [monthKeyOf(ref.m), oldRest],
    ]);
    return { m: newMonth, id: ref.id };
  });
}

/** Xoá khoản chi. Trả về true nếu có xoá. Khóa tháng được giữ lại (có thể rỗng) như PWA. */
export function deleteExpense(ref: ExpenseRef): Promise<boolean> {
  return serial(async () => {
    const data = await readMonthRaw(ref.m);
    if (!(ref.id in data)) return false;
    const { [ref.id]: _removed, ...rest } = data;
    void _removed;
    await saveJsonStrict(monthKeyOf(ref.m), rest);
    return true;
  });
}

/**
 * Xoá khoản chi như `deleteExpense` nhưng trả về hàm hoàn tác (ghi lại đúng bản ghi thô, cùng id và tháng).
 * Trả về null nếu không có gì để xoá. Hoàn tác không ghi đè nếu id đã được dùng lại.
 */
export function deleteExpenseUndoable(ref: ExpenseRef): Promise<(() => Promise<boolean>) | null> {
  return serial(async () => {
    const data = await readMonthRaw(ref.m);
    if (!(ref.id in data)) return null;
    const removed = data[ref.id];
    const { [ref.id]: _removed, ...rest } = data;
    void _removed;
    await saveJsonStrict(monthKeyOf(ref.m), rest);
    return () =>
      serial(async () => {
        const current = await readMonthRaw(ref.m);
        if (ref.id in current) return false;
        await saveJsonStrict(monthKeyOf(ref.m), { ...current, [ref.id]: removed });
        return true;
      });
  });
}

/** Tìm mọi khoản có `src` cho trước, trên tất cả các tháng. */
export function listBySource(src: string): Promise<ExpenseRef[]> {
  return serial(async () => {
    const prefix = StorageKeys.expenseMonthPrefix;
    const months = (await listKeys())
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .filter(isValidMonthKey)
      .sort();
    const refs: ExpenseRef[] = [];
    for (const month of months) {
      const data = await readMonthRaw(month);
      for (const [id, entry] of Object.entries(data)) {
        if (isRawExpense(entry) && entry.src === src) refs.push({ m: month, id });
      }
    }
    return refs;
  });
}

// ───────────────────────── Cài đặt ─────────────────────────

export function loadSettings(): Promise<ExpenseSettings> {
  return serial(async () => {
    const raw = await loadJsonStrict<unknown>(StorageKeys.settings);
    return raw === undefined ? EMPTY_SETTINGS : normalizeSettings(raw);
  });
}

/** Ghi cài đặt, giữ nguyên các trường lạ đang có trong bản lưu. */
export function saveSettings(settings: ExpenseSettings): Promise<void> {
  return serial(async () => {
    const raw = await loadJsonStrict<unknown>(StorageKeys.settings);
    const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    await saveJsonStrict(StorageKeys.settings, {
      ...base,
      budget: settings.budget,
      budgets: settings.budgets,
      cats: settings.cats,
      banks: settings.banks, // không có = xoá hết tài khoản nhận tiền
      bank: undefined, // khoá của bản cũ (một tài khoản) đã chuyển sang `banks`
      catBudgets: settings.catBudgets, // không có = bỏ hết hạn mức theo mục
      recurring: settings.recurring, // không có = bỏ hết chi tiêu định kỳ
      hiddenPaid: settings.hiddenPaid, // không có = hiện lại mọi khoản đã thanh toán
    });
  });
}
