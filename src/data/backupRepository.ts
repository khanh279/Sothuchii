/**
 * Sao lưu / khôi phục / xoá dữ liệu trên bộ nhớ máy (phần ghi của `domain/backup`).
 *
 * An toàn dữ liệu:
 * - Tạo sao lưu: dữ liệu hỏng (JSON lỗi hoặc sai kiểu) làm thao tác ném StorageCorruptError, KHÔNG tạo file thiếu âm thầm.
 * - Khôi phục: kiểm tra toàn bộ nội dung TRƯỚC khi ghi; ghi dữ liệu mới trước, xoá phần cũ sau; nếu lỗi giữa chừng thì
 *   trả lại đúng giá trị cũ của mọi khóa đã chạm tới.
 * - Xoá một phần: xoá trước các khoản chi cá nhân do phần đó tạo (`src:'quy'` / `src:'cb'`), rồi mới xoá dữ liệu;
 *   dừng giữa chừng thì tệ nhất là phần dữ liệu còn nguyên (đồng bộ sẽ tạo lại khoản chi), không mất thêm gì.
 * Màn hình phải chặn thao tác khác trong lúc đang khôi phục / xoá.
 */

import { delExp, listSrc } from '@/data/expenseApi';
import { refreshPeopleFromData } from '@/data/peopleRepository';
import { StorageCorruptError, StorageKeys, getRawMany, listKeys, loadJsonStrict, removeKeys, setRawMany } from '@/data/storage';
import {
  RESTORE_ERRORS,
  buildBackup,
  describeRestore,
  parseBackup,
  type BackupDocument,
  type BackupSection,
  type RestorePlan,
} from '@/domain/backup';
import { normalizePeople } from '@/domain/people';
import { isValidMonthKey } from '@/utils/date';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

async function monthKeys(): Promise<string[]> {
  const prefix = StorageKeys.expenseMonthPrefix;
  return (await listKeys()).filter((key) => key.startsWith(prefix) && isValidMonthKey(key.slice(prefix.length)));
}

/** Đọc một khóa phải là mảng (hoặc chưa có). Có mà sai kiểu là dữ liệu hỏng, không đoán. */
async function loadArray(key: string): Promise<unknown[]> {
  const value = await loadJsonStrict<unknown>(key);
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new StorageCorruptError(key);
  return value;
}

// ───────────────────────── Sao lưu ─────────────────────────

/** Dựng nội dung file sao lưu từ dữ liệu hiện có. Ném StorageCorruptError nếu có phần dữ liệu hỏng. */
export async function createBackupDocument(now: number = Date.now()): Promise<BackupDocument> {
  const settings = await loadJsonStrict<unknown>(StorageKeys.settings);
  const months: Record<string, unknown> = {};
  for (const key of await monthKeys()) {
    const value = await loadJsonStrict<unknown>(key);
    if (value !== undefined && !isRecord(value)) throw new StorageCorruptError(key);
    if (value) months[key.slice(StorageKeys.expenseMonthPrefix.length)] = value;
  }
  const fund = await loadJsonStrict<unknown>(StorageKeys.fund);
  const people = await loadJsonStrict<unknown>(StorageKeys.people);
  return buildBackup(
    {
      people: normalizePeople(people),
      settings: settings ?? {},
      months,
      fund: fund ?? null,
      bills: await loadArray(StorageKeys.bills),
      pays: await loadArray(StorageKeys.pays),
      names: await loadArray(StorageKeys.billNames),
    },
    now,
  );
}

export async function createBackupText(now: number = Date.now()): Promise<string> {
  return JSON.stringify(await createBackupDocument(now));
}

// ───────────────────────── Khôi phục ─────────────────────────

export type RestoreResult = { ok: true; sections: BackupSection[]; message: string } | { ok: false; error: string };

const json = (value: unknown) => JSON.stringify(value);

/** Mọi ghi và xoá của một kế hoạch khôi phục. */
async function describeWrites(plan: RestorePlan): Promise<{ writes: [string, string][]; removes: string[] }> {
  const writes: [string, string][] = [];
  const removes: string[] = [];
  if (plan.chiTieu) {
    if (plan.chiTieu.settings) writes.push([StorageKeys.settings, json(plan.chiTieu.settings)]);
    else removes.push(StorageKeys.settings);
    const keep = new Set<string>();
    for (const [month, value] of Object.entries(plan.chiTieu.months)) {
      const key = StorageKeys.expenseMonthPrefix + month;
      keep.add(key);
      writes.push([key, json(value)]);
    }
    for (const key of await monthKeys()) if (!keep.has(key)) removes.push(key); // tháng cũ không có trong file bị thay thế
  }
  if (plan.fund) writes.push([StorageKeys.fund, json(plan.fund)]);
  if (plan.chiaBill) {
    writes.push([StorageKeys.bills, json(plan.chiaBill.bills)]);
    writes.push([StorageKeys.pays, json(plan.chiaBill.pays)]);
    writes.push([StorageKeys.billNames, json(plan.chiaBill.names)]);
    // Cờ tương thích PWA: dữ liệu v2, không cần di chuyển dữ liệu cũ.
    writes.push([StorageKeys.me, json('')]);
    writes.push([StorageKeys.meV4, '1']);
  }
  if (plan.people) writes.push([StorageKeys.people, json(normalizePeople(plan.people))]);
  return { writes, removes };
}

/**
 * Khôi phục từ nội dung sao lưu. Nội dung sai thì trả lỗi và KHÔNG ghi gì. Phần có trong file thay thế phần hiện có
 * (Chi tiêu: thay cả các tháng và cài đặt); phần không có trong file giữ nguyên.
 */
export async function restoreFromText(text: string): Promise<RestoreResult> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  const { plan } = parsed;

  const { writes, removes } = await describeWrites(plan);
  const touched = [...new Set([...writes.map(([key]) => key), ...removes])];
  const before = await getRawMany(touched); // bản dự phòng để trả lại nếu lỗi

  try {
    await setRawMany(writes); // ghi dữ liệu mới trước
    await removeKeys(removes); // rồi mới xoá phần cũ
  } catch {
    try {
      const restoreEntries = touched.filter((key) => before[key] !== null).map((key) => [key, before[key] as string] as const);
      await setRawMany(restoreEntries);
      await removeKeys(touched.filter((key) => before[key] === null));
    } catch {
      // không trả lại được: để nguyên, người dùng vẫn có file sao lưu của họ
    }
    return { ok: false, error: 'Chưa lưu được. Bộ nhớ có thể đã đầy; dữ liệu cũ được giữ nguyên.' };
  }
  // Như PWA: thêm tên đã dùng trong dữ liệu vừa khôi phục vào Danh sách người. Lỗi ở bước này không huỷ khôi phục.
  await refreshPeopleFromData().catch(() => undefined);
  return { ok: true, sections: plan.sections, message: describeRestore(plan.sections) };
}

// ───────────────────────── Xoá dữ liệu ─────────────────────────

/** Xoá các khoản chi cá nhân do một phần tạo ra (như PWA, đồng bộ dọn khoản mồ côi sau khi xoá dữ liệu gốc). */
async function removeLinkedExpenses(src: 'quy' | 'cb'): Promise<void> {
  for (const ref of await listSrc(src)) await delExp(ref);
}

/**
 * Xoá toàn bộ dữ liệu của một phần. Quỹ nhóm / Chia bill còn xoá các khoản chi cá nhân do phần đó tạo
 * (`src:'quy'` / `src:'cb'`); khoản chi người dùng tự nhập không bị đụng.
 */
export async function wipeSection(section: BackupSection): Promise<void> {
  if (section === 'chi-tieu') {
    await removeKeys([...(await monthKeys()), StorageKeys.settings]);
  } else if (section === 'quy-nhom') {
    await removeLinkedExpenses('quy');
    await removeKeys([StorageKeys.fund]);
  } else {
    await removeLinkedExpenses('cb');
    await removeKeys([StorageKeys.bills, StorageKeys.pays, StorageKeys.billNames]);
  }
}

export { RESTORE_ERRORS };
