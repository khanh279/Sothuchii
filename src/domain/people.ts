/**
 * Danh sách người dùng chung (khóa `sotien:people`), hàm thuần. Chuyển từ `pe`, `Ct`, `Ye`, `Pt`, `Ot` của PWA.
 * Danh sách chỉ chứa tên; "Tôi" luôn có sẵn nên không nằm trong danh sách.
 */

import { FUND_OWNER_NAME } from '@/domain/funds';

export const PERSON_NAME_LIMIT = 30;

/** Gộp khoảng trắng, bỏ khoảng trắng hai đầu, cắt còn 30 ký tự. */
export function cleanPersonName(value: unknown): string {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, PERSON_NAME_LIMIT);
}

/** Đọc danh sách thô: bỏ tên trống, bỏ "Tôi" (đúng chữ), bỏ trùng không phân biệt hoa thường (giữ bản đầu). */
export function normalizePeople(raw: unknown): string[] {
  const seen = new Set<string>();
  const people: string[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const name = cleanPersonName(item);
    const key = name.toLowerCase();
    if (name && name !== FUND_OWNER_NAME && !seen.has(key)) {
      seen.add(key);
      people.push(name);
    }
  }
  return people;
}

export type AddPersonResult =
  | { status: 'empty' }
  | { status: 'me' }
  | { status: 'exists'; name: string; people: string[] }
  | { status: 'added'; name: string; people: string[] };

/** Thêm một người. "Tôi" (không phân biệt hoa thường) luôn có sẵn; tên đã có thì dùng lại tên đó. */
export function addPerson(people: readonly string[], input: string): AddPersonResult {
  const name = cleanPersonName(input);
  if (!name) return { status: 'empty' };
  if (name.toLowerCase() === FUND_OWNER_NAME.toLowerCase()) return { status: 'me' };
  const found = people.find((person) => person.toLowerCase() === name.toLowerCase());
  if (found) return { status: 'exists', name: found, people: [...people] };
  return { status: 'added', name, people: [...people, name] };
}

/** Bỏ một người (khớp đúng tên). */
export function removePerson(people: readonly string[], name: string): string[] {
  return people.filter((person) => person !== name);
}

/** Thêm các tên chưa có (không phân biệt hoa thường), giữ thứ tự: dùng khi tạo danh sách lần đầu. */
export function mergePeople(people: readonly string[], names: readonly string[]): string[] {
  const seen = new Set(people.map((person) => person.toLowerCase()));
  const merged = [...people];
  for (const name of names) {
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      merged.push(name);
    }
  }
  return merged;
}

/**
 * Tên đã dùng trong dữ liệu cũ để tạo danh sách lần đầu: bỏ "Tôi", "Người N" (tên tự đặt) và chữ A–T đơn lẻ
 * (tên mặc định của Chia bill).
 */
export function seedNamesFrom(rawNames: readonly unknown[]): string[] {
  const names: string[] = [];
  for (const raw of rawNames) {
    const name = cleanPersonName(raw);
    if (name && name !== FUND_OWNER_NAME && !/^Người \d+$/.test(name) && !/^[A-T]$/.test(name)) names.push(name);
  }
  return names;
}

/** Các lựa chọn trong bộ chọn một người: "Tôi", danh sách, rồi tên đang chọn mà chưa có trong danh sách. */
export function pickerOptions(people: readonly string[], selected: string | null): string[] {
  const options = [FUND_OWNER_NAME, ...people];
  const name = selected ? cleanPersonName(selected) : '';
  if (name && !options.includes(name)) options.push(name);
  return options;
}
