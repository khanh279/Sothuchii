/**
 * Danh sách người dùng chung, khóa `sotien:people` = mảng tên (đúng định dạng PWA).
 *
 * An toàn dữ liệu: mọi thao tác đi qua một hàng đợi; JSON hỏng làm thao tác ném StorageCorruptError và
 * KHÔNG bị ghi đè. Lần đầu (chưa có khóa), danh sách được tạo từ tên đã dùng trong Quỹ / Chia bill / Công nợ
 * như PWA; các nguồn đó chỉ ĐỌC, và nguồn nào hỏng thì bỏ qua (không ghi gì vào đó).
 */

import { StorageKeys, loadJsonStrict, saveJsonStrict } from '@/data/storage';
import { addPerson, mergePeople, normalizePeople, removePerson, seedNamesFrom, type AddPersonResult } from '@/domain/people';

let tail: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task);
  tail = run.catch(() => undefined);
  return run;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

async function readOther(key: string): Promise<unknown> {
  try {
    return await loadJsonStrict<unknown>(key);
  } catch {
    return undefined; // nguồn hỏng: bỏ qua, không ghi gì
  }
}

/** Mọi tên người đã xuất hiện trong dữ liệu Quỹ, Chia bill và Công nợ (chưa lọc). */
async function namesInOtherModules(): Promise<unknown[]> {
  const names: unknown[] = [];
  for (const bill of arrayOf(await readOther(StorageKeys.bills))) {
    if (isRecord(bill)) for (const person of arrayOf(bill.people)) if (isRecord(person)) names.push(person.name);
  }
  for (const pay of arrayOf(await readOther(StorageKeys.pays))) {
    if (isRecord(pay)) names.push(pay.from, pay.to);
  }
  const fund = await readOther(StorageKeys.fund);
  if (isRecord(fund)) {
    for (const contribution of arrayOf(fund.contribs)) {
      if (isRecord(contribution)) for (const person of arrayOf(contribution.people)) if (isRecord(person)) names.push(person.name);
    }
  }
  return names;
}

async function readPeople(): Promise<string[]> {
  const raw = await loadJsonStrict<unknown>(StorageKeys.people);
  if (raw !== undefined) return normalizePeople(raw);
  const seeded = mergePeople([], seedNamesFrom(await namesInOtherModules()));
  await saveJsonStrict(StorageKeys.people, seeded);
  return seeded;
}

export function loadPeople(): Promise<string[]> {
  return serial(readPeople);
}

/** Thêm một người; trả về kết quả để giao diện chọn thông báo. Chỉ ghi khi thật sự thêm. */
export function addPersonToList(name: string): Promise<AddPersonResult> {
  return serial(async () => {
    const result = addPerson(await readPeople(), name);
    if (result.status === 'added') await saveJsonStrict(StorageKeys.people, result.people);
    return result;
  });
}

export function removePersonFromList(name: string): Promise<void> {
  return serial(async () => {
    const people = await readPeople();
    const next = removePerson(people, name);
    if (next.length !== people.length) await saveJsonStrict(StorageKeys.people, next);
  });
}
