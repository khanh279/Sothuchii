/**
 * Trạng thái và ô nhập của màn tính chia bill (hàm thuần). Chuyển từ `S`, `Cn`, `Xn`, `An` và các bộ lọc ô nhập
 * của `mod-c` trong PWA. Tiền ở đây là ĐỒNG (số nguyên).
 */

import { BILL_OWNER_NAME, defaultPersonName } from '@/domain/bills';
import { maskVndInput, parseVndInput } from '@/domain/money';
import type { BillPerson, SplitRow } from '@/types/bill';
import type { Vnd } from '@/types/money';

/** Một dòng người trong form; giữ CHỮ người dùng gõ ở ba ô (đã chuẩn hoá). */
export interface FormPerson {
  /** Tên đã chọn; trống = dùng tên mặc định theo thứ tự dòng. */
  name: string;
  /** Số tiền đã chi (ĐỒNG), chỉ gồm chữ số ("120000"); trống = chưa chi. */
  paidText: string;
  /** Hệ số, ví dụ "2" hoặc "1,5"; trống = 1. */
  weightText: string;
  /** Mức cố định (ĐỒNG), chỉ gồm chữ số ("30000"); trống = không cố định. */
  fixedText: string;
}

export const emptyPerson = (name = ''): FormPerson => ({ name, paidText: '', weightText: '', fixedText: '' });/** Ô hệ số: chỉ chữ số, dấu chấm/phẩy (chấm đổi thành phẩy), tối đa 4 ký tự. */
export function maskWeightInput(text: string): string {
  return String(text).replace(/[^0-9.,]/g, '').replace(/\./g, ',').slice(0, 4);
}

/** Hệ số từ chữ gõ; trống hoặc không hợp lệ là 1. */
export function parseWeightText(text: string): number {
  const value = parseFloat(String(text).replace(',', '.'));
  return Number.isFinite(value) ? value : 1;
}

/** Ô mức cố định: chỉ chữ số (ĐỒNG), tối đa 9 chữ số. */
export function maskFixedInput(text: string): string {
  return maskVndInput(text, 9);
}

/** Số tiền (ĐỒNG) từ chữ đã mask (dùng cho cả ô "Đã chi" và ô mức cố định); trống thì `undefined` (không cố định). */
export function parseFixedText(text: string): Vnd | undefined {
  if (!text) return undefined;
  return parseVndInput(text);
}

/**
 * Sửa ô hệ số. Gõ hệ số thì bỏ mức cố định (một người chỉ dùng một trong hai).
 */
export function withWeightText(person: FormPerson, text: string): FormPerson {
  return { ...person, weightText: maskWeightInput(text), fixedText: '' };
}

/** Sửa ô mức cố định. Có chữ thì bỏ hệ số; ô trống thì không còn mức cố định. */
export function withFixedText(person: FormPerson, text: string): FormPerson {
  const fixedText = maskFixedInput(text);
  return { ...person, fixedText, weightText: fixedText ? '' : person.weightText };
}

/** Dòng người của form → dữ liệu để tính (hàm `Cn`): người đầu luôn là "Tôi", tên trống dùng chữ cái theo dòng. */
export function toSplitPeople(rows: readonly FormPerson[]): BillPerson[] {
  return rows.map((row, index) => {
    const person: BillPerson = {
      name: index === 0 ? BILL_OWNER_NAME : row.name.trim() || defaultPersonName(index),
      paid: parseFixedText(row.paidText) ?? 0,
      w: row.fixedText ? 1 : parseWeightText(row.weightText),
    };
    const fixed = parseFixedText(row.fixedText);
    if (fixed !== undefined) person.fix = fixed;
    return person;
  });
}/**
 * Danh sách ban đầu: "Tôi" cộng những người trong nhóm lần chia gần nhất mà vẫn còn trong Danh sách người
 * (bỏ trùng); số dòng = số người đó, tối thiểu 1 như PWA (khi đó chưa lưu được vì cần ≥ 2 người).
 */
export function initialPeople(rememberedNames: readonly string[], knownPeople: readonly string[]): FormPerson[] {
  const rows = [emptyPerson(BILL_OWNER_NAME)];
  for (const raw of rememberedNames.slice(1)) {
    const name = String(raw || '').trim();
    if (name && knownPeople.includes(name) && !rows.some((row) => row.name === name)) rows.push(emptyPerson(name));
  }
  return rows;
}export interface RowStatus {
  kind: 'get' | 'owe' | 'even';
  /** Số tiền (đồng, luôn dương). */
  amount: number;
}

/** Trạng thái cuối của một người: nhận lại, còn thiếu hoặc đã đủ (hàm `Un`, làm tròn đến đồng). */
export function rowStatus(row: Pick<SplitRow, 'net'>): RowStatus {
  const vnd = Math.round(row.net);
  return vnd > 0 ? { kind: 'get', amount: vnd } : vnd < 0 ? { kind: 'owe', amount: -vnd } : { kind: 'even', amount: 0 };
}/**
 * Áp dụng lựa chọn thành viên (nút "Chọn thành viên"): dòng đầu luôn là "Tôi" với dữ liệu đang có; các thành viên
 * khác theo đúng thứ tự đã chọn, người đã có dòng thì giữ nguyên số tiền / hệ số, người mới thì dòng trống.
 * Số dòng = số người đã chọn (có thể chỉ còn "Tôi").
 */
export function applyMemberSelection(rows: readonly FormPerson[], selected: readonly string[]): FormPerson[] {
  const byName = new Map<string, FormPerson>();
  for (const row of rows) if (row.name) byName.set(row.name, row);
  const me = rows[0] ? { ...rows[0], name: BILL_OWNER_NAME } : emptyPerson(BILL_OWNER_NAME);
  const next = [me];
  for (const name of selected) {
    if (name === BILL_OWNER_NAME || next.some((row) => row.name === name)) continue;
    next.push({ ...(byName.get(name) ?? emptyPerson(name)) });
  }
  return next;
}

/** Sau khi lưu bill: xoá số tiền, hệ số, mức cố định nhưng giữ nhóm người cho lần chia sau (như PWA). */
export function resetAfterSave(rows: readonly FormPerson[]): FormPerson[] {
  return rows.map((row) => emptyPerson(row.name));
}
