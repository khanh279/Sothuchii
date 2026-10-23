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
import { checkAdvanceGive, checkDirectSpend, checkPayout, checkRefund } from '@/domain/fundAdvance';
import { FUND_NAME_MAX, normalizeFundData } from '@/domain/funds';
import type { DateStr, ExpenseRef } from '@/types/expense';
import type { ContributionPerson, Fund, FundData, FundExpenseMode, FundTxnKind } from '@/types/fund';
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
const LISTS = ['funds', 'contribs', 'expenses', 'advances', 'fundTxns'] as const;

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
        // Hồ sơ ứng trước và giao dịch hoàn tiền / thanh toán của quỹ bị xoá cũng bị xoá cùng quỹ (chỉ khi khóa đã tồn tại).
        ...(raw.advances !== undefined ? { advances: arrayOf(raw.advances).filter(keep) } : {}),
        ...(raw.fundTxns !== undefined ? { fundTxns: arrayOf(raw.fundTxns).filter(keep) } : {}),
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
  /** Số tiền ĐỒNG. */
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
  /**
   * Mã do giao diện sinh MỘT LẦN cho mỗi lần mở form: bấm lưu nhiều lần hoặc thử lại sau lỗi không tạo bản ghi trùng
   * (đã có bản ghi mã này thì không ghi thêm). Chỉ dùng khi thêm mới (không có `id`).
   */
  clientId?: string;
  fundId: string;
  title: string;
  date: DateStr;
  /** ĐỒNG, nhập trực tiếp. */
  amount: Vnd;
  /** Hình thức chi khi THÊM MỚI: bỏ trống = quỹ chi trực tiếp. 'personal' cần `payer`; 'advance' cần `advanceId` (người chi lấy từ hồ sơ). */
  mode?: FundExpenseMode;
  payer?: string;
  advanceId?: string;
  /**
   * Chỉ khi THÊM MỚI với mode 'personal': phần do QUỸ chi trực tiếp (khoản vượt số dư được chia nguồn tiền). 0 < phần < amount và không vượt tiền thực tế
   * trong quỹ — kiểm tra lại ngay lúc ghi. Phần còn lại là cá nhân ứng (quỹ nợ). Ghi MỘT bản ghi duy nhất nên không có khoản chi nào bị tính hai lần.
   */
  fundPart?: Vnd;
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
      if (input.clientId && expenses.some((item) => isRecord(item) && String(item.id) === input.clientId)) return { next: raw, result: input.clientId };
      const extra: Record<string, unknown> = {};
      let targetFund = input.fundId;
      // Chi TRỰC TIẾP lấy tiền khỏi quỹ: kiểm tra lại số dư ngay lúc ghi (không tin số đang hiển thị trên màn hình).
      if (!input.mode) {
        const spend = checkDirectSpend(normalizeFundData(raw), input.fundId, input.amount);
        if (!spend.ok) throw new FundInputError(spend.message);
      }
      if (input.mode === 'personal') {
        const payer = String(input.payer ?? '').trim();
        if (!payer) throw new FundInputError('Chọn người chi.');
        Object.assign(extra, { mode: 'personal', payer });
        if (input.fundPart !== undefined && input.fundPart !== null) {
          const part = Math.round(input.fundPart);
          if (!(part > 0) || part >= fields.amount) throw new FundInputError('Phần quỹ chi phải lớn hơn 0 và nhỏ hơn tổng khoản chi.');
          const take = checkDirectSpend(normalizeFundData(raw), input.fundId, part);
          if (!take.ok) throw new FundInputError(take.message);
          Object.assign(extra, { fundPart: part });
        }
      } else if (input.mode === 'advance') {
        const advance = arrayOf(raw.advances).find((item) => isRecord(item) && String(item.id) === input.advanceId);
        if (!isRecord(advance)) throw new FundInputError('Không tìm thấy hồ sơ ứng trước.');
        targetFund = String(advance.fundId);
        Object.assign(extra, { mode: 'advance', payer: String(advance.person ?? ''), advanceId: String(advance.id) });
      }
      const id = input.clientId || newExpenseId(now);
      return { next: { ...raw, expenses: [...expenses, { id, ...fields, fundId: targetFund, ...extra }] }, result: id };
    }
    let found = false;
    const updated = expenses.map((item) => {
      if (!isRecord(item) || String(item.id) !== input.id) return item;
      found = true;
      // Khoản cá nhân đã ứng được sửa số tiền: không được thấp hơn số quỹ đã trả (tránh công nợ âm). Hình thức chi / người chi giữ nguyên.
      // Khoản chi trực tiếp: chỉ khi TĂNG số tiền mới phải kiểm tra số dư (số cũ được hoàn lại trước khi trừ số mới); sửa nội dung / giảm số tiền luôn được.
      if (!item.mode && fields.amount > (Number(item.amount) || 0)) {
        const spend = checkDirectSpend(normalizeFundData(raw), String(item.fundId), fields.amount, input.id);
        if (!spend.ok) throw new FundInputError(spend.message);
      }
      if (item.mode === 'personal') {
        const paid = arrayOf(raw.fundTxns).reduce<number>((sum, txn) => (isRecord(txn) && txn.kind === 'payout' && String(txn.expenseId) === input.id ? sum + (Number(txn.amount) || 0) : sum), 0);
        // Khoản đã chia nguồn tiền: tổng không được thấp hơn phần quỹ đã chi cộng số quỹ đã trả cho phần cá nhân ứng.
        const fundPart = Math.round(Number(item.fundPart) || 0);
        if (fields.amount < paid + fundPart || (fundPart > 0 && fields.amount <= fundPart)) throw new FundInputError('Số tiền không được nhỏ hơn phần quỹ đã chi và số quỹ đã thanh toán cho khoản này.');
      }
      return { ...item, ...fields, ...(item.mode === 'advance' ? { fundId: item.fundId } : {}) };
    });
    return { next: found ? { ...raw, expenses: updated } : raw, result: found ? input.id : null };
  });
}

export function deleteFundExpense(id: string): Promise<boolean> {
  return mutate((raw) => {
    // Khoản chi đã có thanh toán của quỹ thì phải xoá thanh toán trước (không để mất dấu dòng tiền).
    if (arrayOf(raw.fundTxns).some((txn) => isRecord(txn) && String(txn.expenseId) === id)) {
      throw new FundInputError('Khoản chi này đã có giao dịch thanh toán, hãy xoá thanh toán trước.');
    }
    const items = arrayOf(raw.expenses);
    const rest = items.filter((item) => !(isRecord(item) && String(item.id) === id));
    return rest.length === items.length ? { next: raw, result: false } : { next: { ...raw, expenses: rest }, result: true };
  });
}

// ───────────────────────── Hồ sơ ứng trước ─────────────────────────

export interface AdvanceInput {
  /** Mã do giao diện sinh một lần cho mỗi lần mở form (chống ghi trùng khi bấm lưu nhiều lần). */
  clientId?: string;
  fundId: string;
  person: string;
  title: string;
  date: DateStr;
  /** ĐỒNG, được phép 0 (giao việc nhưng chưa cấp tiền). */
  amount: Vnd;
}

/** Giao tiền ứng trước cho một người: tạo hồ sơ ứng trước (dòng tiền quỹ đã xuất, chưa phải chi phí). Trả về mã hồ sơ. */
export function createAdvance(input: AdvanceInput, now: number = Date.now()): Promise<string> {
  const person = String(input.person ?? '').trim();
  if (!person) return Promise.reject(new FundInputError('Chọn người nhận tiền ứng.'));
  if (!Number.isFinite(input.amount) || Math.round(input.amount) < 0) return Promise.reject(new FundInputError('Số tiền giao không hợp lệ.'));
  return mutate((raw) => {
    requireFund(raw, input.fundId);
    const advances = arrayOf(raw.advances);
    if (input.clientId && advances.some((item) => isRecord(item) && String(item.id) === input.clientId)) return { next: raw, result: input.clientId };
    // Giao tiền ứng lấy tiền khỏi quỹ: kiểm tra lại số dư ngay lúc ghi.
    const give = checkAdvanceGive(normalizeFundData(raw), input.fundId, input.amount);
    if (!give.ok) throw new FundInputError(give.message);
    const id = input.clientId || `a_${newExpenseId(now)}`;
    const record = { id, fundId: input.fundId, person, title: input.title, date: input.date, amount: Math.round(input.amount) };
    return { next: { ...raw, advances: [...advances, record] }, result: id };
  });
}

export interface AdvanceUpdate {
  title: string;
  date: DateStr;
  /** ĐỒNG, ≥ 0; không vượt số dư quỹ (tính lại cả số đã giao của chính hồ sơ này). */
  amount: Vnd;
}

/**
 * Sửa hồ sơ giao tiền ứng: nội dung, ngày và số tiền giao. Người nhận và quỹ giữ nguyên (các khoản chi / hoàn tiền / thanh toán gắn với hồ sơ vẫn đúng).
 * Số tiền mới phải ≥ 0, không vượt số dư quỹ lúc ghi. Trả về false nếu không thấy hồ sơ.
 */
export function updateAdvance(id: string, input: AdvanceUpdate): Promise<boolean> {
  if (!Number.isFinite(input.amount) || Math.round(input.amount) < 0) return Promise.reject(new FundInputError('Số tiền giao không hợp lệ.'));
  return mutate((raw) => {
    const advances = arrayOf(raw.advances);
    const current = advances.find((item) => isRecord(item) && String(item.id) === id);
    if (!isRecord(current)) return { next: raw, result: false };
    const amount = Math.round(input.amount);
    // Chỉ khi TĂNG số tiền giao mới kiểm tra số dư; giảm hoặc sửa nội dung / ngày luôn được.
    if (amount > (Number(current.amount) || 0)) {
      const give = checkAdvanceGive(normalizeFundData(raw), String(current.fundId), amount, id);
      if (!give.ok) throw new FundInputError(give.message);
    }
    const updated = advances.map((item) => (item === current ? { ...item, title: input.title, date: input.date, amount } : item));
    return { next: { ...raw, advances: updated }, result: true };
  });
}

/** Xoá hồ sơ ứng trước chỉ khi chưa có khoản chi / hoàn tiền / thanh toán nào gắn với nó (không làm mất lịch sử). */
export function deleteAdvance(id: string): Promise<boolean> {
  return mutate((raw) => {
    const linked =
      arrayOf(raw.expenses).some((item) => isRecord(item) && String(item.advanceId) === id) ||
      arrayOf(raw.fundTxns).some((item) => isRecord(item) && String(item.advanceId) === id);
    if (linked) throw new FundInputError('Hồ sơ đã có khoản chi hoặc giao dịch, hãy xoá các khoản đó trước.');
    const items = arrayOf(raw.advances);
    const rest = items.filter((item) => !(isRecord(item) && String(item.id) === id));
    return rest.length === items.length ? { next: raw, result: false } : { next: { ...raw, advances: rest }, result: true };
  });
}

// ───────────────────────── Hoàn tiền ứng / thanh toán cho cá nhân ─────────────────────────

export interface FundTxnInput {
  clientId?: string;
  kind: FundTxnKind;
  date: DateStr;
  /** ĐỒNG, > 0 và không vượt số còn giữ (hoàn) / còn nợ (thanh toán) — kiểm tra lại ngay trước khi ghi. */
  amount: Vnd;
  /** Hoàn tiền: bắt buộc `advanceId`. Thanh toán: `expenseId` (khoản cá nhân ứng) hoặc `advanceId` (phần chi vượt tiền ứng). */
  advanceId?: string;
  expenseId?: string;
}

/** Ghi giao dịch hoàn tiền / thanh toán. Chỉ đổi dòng tiền và công nợ: không tạo khoản chi, không đổi tổng chi. Trả về mã giao dịch. */
export function saveFundTxn(input: FundTxnInput, now: number = Date.now()): Promise<string> {
  return mutate((raw) => {
    const txns = arrayOf(raw.fundTxns);
    if (input.clientId && txns.some((item) => isRecord(item) && String(item.id) === input.clientId)) return { next: raw, result: input.clientId };
    const data = normalizeFundData(raw);
    let fundId = '';
    let person = '';
    let check;
    if (input.kind === 'refund') {
      if (!input.advanceId) throw new FundInputError('Chọn hồ sơ ứng trước.');
      check = checkRefund(data, input.advanceId, input.amount);
      const advance = data.advances?.find((a) => a.id === input.advanceId);
      fundId = advance?.fundId ?? '';
      person = advance?.person ?? '';
    } else if (input.expenseId) {
      check = checkPayout(data, { expenseId: input.expenseId }, input.amount);
      const expense = data.expenses.find((e) => e.id === input.expenseId);
      fundId = expense?.fundId ?? '';
      person = expense?.payer ?? '';
    } else if (input.advanceId) {
      check = checkPayout(data, { advanceId: input.advanceId }, input.amount);
      const advance = data.advances?.find((a) => a.id === input.advanceId);
      fundId = advance?.fundId ?? '';
      person = advance?.person ?? '';
    } else throw new FundInputError('Chọn khoản cần thanh toán.');
    if (!check.ok) throw new FundInputError(check.message);
    const id = input.clientId || `t_${newExpenseId(now)}`;
    const record: Record<string, unknown> = { id, fundId, kind: input.kind, person, amount: check.amount, date: input.date };
    if (input.advanceId) record.advanceId = input.advanceId;
    if (input.expenseId) record.expenseId = input.expenseId;
    return { next: { ...raw, fundTxns: [...txns, record] }, result: id };
  });
}

export interface FundTxnUpdate {
  /** ĐỒNG, > 0, kiểm tra lại với đúng quy tắc của loại giao dịch (không tính chính giao dịch đang sửa). */
  amount: Vnd;
  date: DateStr;
}

/**
 * Sửa số tiền / ngày của giao dịch hoàn tiền hoặc thanh toán đã ghi. Loại, người và khoản gốc (hồ sơ ứng trước / khoản chi cá nhân) giữ nguyên.
 * Số tiền mới được kiểm tra bằng `checkRefund` / `checkPayout` trên dữ liệu đã BỎ chính giao dịch này, nên không vượt số còn giữ / còn nợ.
 * Trả về false nếu không thấy giao dịch.
 */
export function updateFundTxn(id: string, input: FundTxnUpdate): Promise<boolean> {
  return mutate((raw) => {
    const txns = arrayOf(raw.fundTxns);
    const current = txns.find((item) => isRecord(item) && String(item.id) === id);
    if (!isRecord(current)) return { next: raw, result: false };
    const data = normalizeFundData({ ...raw, fundTxns: txns.filter((item) => item !== current) });
    const advanceId = current.advanceId ? String(current.advanceId) : undefined;
    const expenseId = current.expenseId ? String(current.expenseId) : undefined;
    let check;
    if (current.kind === 'refund') {
      if (!advanceId) throw new FundInputError('Chọn hồ sơ ứng trước.');
      check = checkRefund(data, advanceId, input.amount);
    } else if (expenseId) check = checkPayout(data, { expenseId }, input.amount);
    else if (advanceId) check = checkPayout(data, { advanceId }, input.amount);
    else throw new FundInputError('Chọn khoản cần thanh toán.');
    if (!check.ok) throw new FundInputError(check.message);
    const updated = txns.map((item) => (item === current ? { ...item, amount: check.amount, date: input.date } : item));
    return { next: { ...raw, fundTxns: updated }, result: true };
  });
}

export function deleteFundTxn(id: string): Promise<boolean> {
  return mutate((raw) => {
    const items = arrayOf(raw.fundTxns);
    const rest = items.filter((item) => !(isRecord(item) && String(item.id) === id));
    return rest.length === items.length ? { next: raw, result: false } : { next: { ...raw, fundTxns: rest }, result: true };
  });
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
