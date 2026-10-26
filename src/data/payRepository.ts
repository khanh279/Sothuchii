/**
 * Đọc/ghi khoản thanh toán (Công nợ) vào bộ nhớ máy, đúng định dạng PWA:
 *   chiabill:v2:pays  ->  [ { id, createdAt, date, note, from, to, amt, kind?, grp?, led?, exp?: [{m,id}], ... }, ... ]  (tiền: ĐỒNG)
 *
 * Nguyên tắc an toàn dữ liệu (giống billRepository): một hàng đợi duy nhất; đọc-sửa-ghi trên bản THÔ nên trường lạ
 * (kể cả `nexp` cũ, không bao giờ đọc hay xoá) và mục không hiểu được đều được giữ nguyên; dữ liệu hỏng (JSON lỗi, không phải
 * mảng) làm thao tác ném StorageCorruptError và KHÔNG bị ghi đè. Chỉ đọc schema `v2`, không chạy migration cũ.
 *
 * Gộp khoản trùng (`dedupePays`) CHỈ chạy khi lưu, không bao giờ khi đọc. Khoản đang được sửa luôn được "khoá" khỏi việc gộp
 * để sửa không cộng tiền hai lần.
 */

import { ensureVndUnits } from '@/data/moneyMigration';
import { StorageCorruptError, StorageKeys, loadJsonStrict, saveJsonStrict } from '@/data/storage';
import { MIN_PAY_AMOUNT } from '@/domain/ledger';
import { normalizePays, payDedupeKey } from '@/domain/pays';
import type { DateStr, ExpenseRef } from '@/types/expense';
import type { Pay } from '@/types/pay';
import { isValidDateStr } from '@/utils/date';
import { roundVnd } from '@/domain/money';

type RawObject = Record<string, unknown>;

const isRecord = (value: unknown): value is RawObject => !!value && typeof value === 'object' && !Array.isArray(value);

/** Dữ liệu khoản trả không hợp lệ để lưu. */
export class PayInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayInputError';
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
export async function readPaysRaw(): Promise<unknown[] | undefined> {
  await ensureVndUnits();
  const value = await loadJsonStrict<unknown>(StorageKeys.pays);
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new StorageCorruptError(StorageKeys.pays);
  return value;
}

/** Đọc-sửa-ghi trên bản thô. `next === current` nghĩa là không đổi gì nên không ghi. */
function mutate<T>(change: (pays: unknown[]) => { next: unknown[]; result: T }): Promise<T> {
  return serial(async () => {
    const current = (await readPaysRaw()) ?? [];
    const { next, result } = change(current);
    if (next !== current) await saveJsonStrict(StorageKeys.pays, next);
    return result;
  });
}

export function loadPays(): Promise<Pay[]> {
  return serial(async () => normalizePays(await readPaysRaw()));
}

// ───────────────────────── Gộp trùng trên bản thô ─────────────────────────

/**
 * Gộp khoản trùng (`Tt`) trên bản thô: giữ khoản đầu của mỗi khóa, CỘNG số tiền các khoản sau vào đó, bỏ các khoản bị gộp.
 * Chỉ sửa trường `amt` của khoản được giữ; mục không phải đối tượng và trường lạ giữ nguyên. `locked` là mã các khoản
 * không được gộp theo cả hai chiều (khoản đang sửa).
 */
function dedupeRaw(list: unknown[], locked: ReadonlySet<string>): unknown[] {
  const normalized = list.map((item) => (isRecord(item) ? normalizePays([item])[0] : null));
  const first = new Map<string, number>();
  const sums = new Map<number, number>();
  const dropped = new Set<number>();
  normalized.forEach((pay, index) => {
    if (!pay) return;
    const base = payDedupeKey(pay);
    const key = locked.has(pay.id) ? `${base}|#locked:${pay.id}` : base;
    const kept = first.get(key);
    if (kept === undefined) {
      first.set(key, index);
      sums.set(index, pay.amt);
    } else {
      sums.set(kept, Math.round((sums.get(kept) ?? 0) + pay.amt));
      dropped.add(index);
    }
  });
  if (!dropped.size) return list;
  return list
    .map((item, index) => (sums.has(index) && isRecord(normalized[index]) && sums.get(index) !== normalized[index]?.amt ? { ...(item as RawObject), amt: sums.get(index) } : item))
    .filter((_, index) => !dropped.has(index));
}

// ───────────────────────── Thêm ─────────────────────────

function checkNewPay(pay: Pay): void {
  if (!Number.isFinite(pay.amt) || roundVnd(pay.amt) <= MIN_PAY_AMOUNT) throw new PayInputError('Nhập số tiền lớn hơn 0.');
  if (!pay.from.trim() || !pay.to.trim()) throw new PayInputError('Chọn người trả và người nhận.');
  if (!pay.id) throw new PayInputError('Khoản trả thiếu mã.');
  if (!isValidDateStr(pay.date)) throw new PayInputError('Ngày không hợp lệ.');
}

/** Trường được ghi cho một khoản trả mới (chỉ trường có giá trị, như PWA). */
function toRaw(pay: Pay): RawObject {
  const raw: RawObject = { id: pay.id, createdAt: pay.createdAt, date: pay.date, note: pay.note, from: pay.from, to: pay.to, amt: pay.amt };
  for (const key of ['kind', 'bill', 'bills', 'lbl', 'grp', 'led'] as const) if (pay[key] !== undefined) raw[key] = pay[key];
  return raw;
}

/**
 * Thêm các khoản trả mới rồi gộp trùng (`ot`): khoản mới giống hệt khoản đã có (cùng ngày, người, loại, ghi chú…) thì CỘNG
 * vào khoản đó, TRỪ khoản có "Tôi" ở một đầu (luôn là dòng riêng, xem `payDedupeKey`). Mỗi khoản phải có mã, ngày hợp lệ, hai người và số tiền > 0 sau khi làm tròn.
 */
export async function appendPays(pays: readonly Pay[]): Promise<void> {
  for (const pay of pays) checkNewPay(pay);
  return mutate((list) => {
    if (!pays.length) return { next: list, result: undefined };
    return { next: dedupeRaw([...list, ...pays.map((pay) => toRaw({ ...pay, amt: roundVnd(pay.amt) }))], new Set()), result: undefined };
  });
}

// ───────────────────────── Sửa ─────────────────────────

export interface PayPatch {
  date: DateStr;
  note: string;
  from: string;
  to: string;
  amt: number;
  /** Đổi loại ('vay' | 'billpay') khi người dùng chủ động đổi; không đưa vào thì giữ nguyên loại cũ. */
  kind?: string;
}

/**
 * Sửa một khoản trả (giữ `id`, `createdAt`, `exp` và mọi trường khác, kể cả trường lạ). Khoản được sửa bị KHOÁ khỏi việc
 * gộp trùng: dù sau khi sửa nó giống hệt khoản khác, hai khoản vẫn tách biệt và tiền không bị cộng. Khoản `ds` (đối soát)
 * đổi loại thì mất cờ `ds`, như PWA. Trả về false nếu không tìm thấy.
 */
export function updatePay(id: string, patch: PayPatch): Promise<boolean> {
  if (!Number.isFinite(patch.amt) || roundVnd(patch.amt) <= MIN_PAY_AMOUNT) return Promise.reject(new PayInputError('Nhập số tiền lớn hơn 0.'));
  if (!patch.from.trim() || !patch.to.trim()) return Promise.reject(new PayInputError('Chọn người trả và người nhận.'));
  if (!isValidDateStr(patch.date)) return Promise.reject(new PayInputError('Ngày không hợp lệ.'));
  return mutate((list) => {
    let found = false;
    const updated = list.map((item) => {
      if (!isRecord(item) || String(item.id) !== id) return item;
      found = true;
      const next: RawObject = { ...item, date: patch.date, note: patch.note, from: patch.from, to: patch.to, amt: roundVnd(patch.amt) };
      if (patch.kind !== undefined && patch.kind !== item.kind && !item.bill) {
        next.kind = patch.kind;
        delete next.ds;
      }
      return next;
    });
    return found ? { next: dedupeRaw(updated, new Set([id])), result: true } : { next: list, result: false };
  });
}

/**
 * Sửa một nhóm khoản trả bill hiển thị chung (PWA: nhiều khoản giữa hai người khác "Tôi"): thay cả nhóm bằng MỘT khoản
 * mới loại 'repay' mang gộp mã bill, hoặc chỉ đổi ghi chú nếu người dùng không đổi gì khác. Trả về false nếu không thấy khoản nào.
 */
export async function replacePayGroup(ids: readonly string[], replacement: Pay): Promise<boolean> {
  checkNewPay(replacement);
  return mutate((list) => {
    const idSet = new Set(ids);
    const inGroup = list.filter((item) => isRecord(item) && idSet.has(String(item.id)));
    if (!inGroup.length) return { next: list, result: false };
    const rest = list.filter((item) => !(isRecord(item) && idSet.has(String(item.id))));
    return { next: dedupeRaw([...rest, toRaw({ ...replacement, amt: roundVnd(replacement.amt) })], new Set([replacement.id])), result: true };
  });
}

/** Chỉ đổi ghi chú của các khoản (PWA: sửa nhóm mà không đổi số tiền / người / ngày). */
export function setPayNotes(ids: readonly string[], note: string): Promise<number> {
  return mutate((list) => {
    const idSet = new Set(ids);
    let changed = 0;
    const next = list.map((item) => {
      if (!isRecord(item) || !idSet.has(String(item.id))) return item;
      changed++;
      return { ...item, note };
    });
    return changed ? { next, result: changed } : { next: list, result: 0 };
  });
}

// ───────────────────────── Xoá ─────────────────────────

/** Xoá các khoản theo mã. Khoản chi cá nhân liên kết thành mồ côi và được đồng bộ dọn. Trả về số khoản đã xoá. */
export function deletePays(ids: readonly string[]): Promise<number> {
  return mutate((list) => {
    const idSet = new Set(ids);
    const rest = list.filter((item) => !(isRecord(item) && idSet.has(String(item.id))));
    return rest.length === list.length ? { next: list, result: 0 } : { next: rest, result: list.length - rest.length };
  });
}

/** Hoàn tác một lần gộp nợ: bỏ mọi khoản có `grp` đó. Trả về số khoản đã bỏ. */
export function deletePayGroup(group: string): Promise<number> {
  return mutate((list) => {
    const rest = list.filter((item) => !(isRecord(item) && item.grp === group));
    return rest.length === list.length ? { next: list, result: 0 } : { next: rest, result: list.length - rest.length };
  });
}

// ───────────────────────── Liên kết với chi tiêu cá nhân ─────────────────────────

export interface PayLink {
  payId: string;
  /** Danh sách tham chiếu khoản chi; `null` hoặc rỗng = bỏ liên kết. */
  exp: readonly ExpenseRef[] | null;
}

/** Ghi lại `exp` của các khoản trả (chỉ trường này). Khoản đã bị xoá trong lúc đồng bộ thì bỏ qua. Trả về số liên kết đã ghi. */
export function setPayLinks(links: readonly PayLink[]): Promise<number> {
  return mutate((list) => {
    const byId = new Map(links.map((link) => [link.payId, link.exp]));
    let written = 0;
    const next = list.map((item) => {
      if (!isRecord(item) || !byId.has(String(item.id))) return item;
      written++;
      const exp = byId.get(String(item.id));
      if (exp && exp.length) return { ...item, exp: exp.map((ref) => ({ m: ref.m, id: ref.id })) };
      const { exp: _removed, ...rest } = item;
      void _removed;
      return rest;
    });
    return written ? { next, result: written } : { next: list, result: 0 };
  });
}
