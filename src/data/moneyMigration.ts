/**
 * Chuyển một lần dữ liệu Chia bill (`chiabill:v2:bills`) và Công nợ (`chiabill:v2:pays`) từ NGHÌN đồng sang ĐỒNG.
 *
 * - Dấu hiệu đã chuyển: khóa `chiabill:unit` = 'vnd'. Chưa có dấu hiệu thì dữ liệu hiện có được coi là nghìn đồng.
 * - An toàn: bản gốc (nguyên văn) được giữ ở hai khóa `...:nghin-backup` TRƯỚC KHI ghi (chỉ tạo nếu chưa có); toàn bộ ghi gói trong MỘT lệnh
 *   `multiSet` nên không có trạng thái nửa chừng; dữ liệu hỏng (JSON lỗi / không phải mảng) thì ném `StorageCorruptError` và KHÔNG ghi gì.
 * - Chạy tuần tự (mỗi lần gọi kiểm lại dấu hiệu trong hàng đợi) nên hai nơi cùng đọc không bao giờ nhân hai lần.
 * - Chưa có bill/khoản trả nào (máy mới) thì chỉ đặt dấu hiệu (trừ khi `markEmpty: false`, dùng cho thao tác chỉ đọc như tạo sao lưu: không ghi gì).
 * - Khôi phục từ file sao lưu (`restoreFromText`) tự đổi sang đồng và đặt dấu hiệu cùng lúc.
 */

import { StorageCorruptError, StorageKeys, getRawMany, setRawMany } from '@/data/storage';
import { billsNghinToVnd, paysNghinToVnd } from '@/domain/moneyMigration';

export const VND_UNIT_MARK = 'vnd';

let tail: Promise<unknown> = Promise.resolve();

/** Bảo đảm bill và khoản trả đã ở đơn vị đồng; gọi trước mọi lần đọc `bills` / `pays`. */
export function ensureVndUnits(options: { markEmpty?: boolean } = {}): Promise<void> {
  const run = tail.then(() => migrate(options.markEmpty ?? true));
  tail = run.catch(() => undefined);
  return run;
}

function parseList(key: string, text: string | null | undefined): unknown[] | undefined {
  if (text === null || text === undefined || text === '') return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) throw new Error('not array');
    return value;
  } catch {
    throw new StorageCorruptError(key);
  }
}

async function migrate(markEmpty: boolean): Promise<void> {
  const mark = await getRawMany([StorageKeys.billMoneyUnit]);
  if (mark[StorageKeys.billMoneyUnit] === VND_UNIT_MARK) return;

  const raw = await getRawMany([StorageKeys.bills, StorageKeys.pays, StorageKeys.billsKBackup, StorageKeys.paysKBackup]);
  const bills = parseList(StorageKeys.bills, raw[StorageKeys.bills]);
  const pays = parseList(StorageKeys.pays, raw[StorageKeys.pays]);

  if (!bills && !pays && !markEmpty) return;

  const writes: [string, string][] = [];
  if (bills) {
    if (raw[StorageKeys.billsKBackup] == null) writes.push([StorageKeys.billsKBackup, raw[StorageKeys.bills] as string]);
    writes.push([StorageKeys.bills, JSON.stringify(billsNghinToVnd(bills))]);
  }
  if (pays) {
    if (raw[StorageKeys.paysKBackup] == null) writes.push([StorageKeys.paysKBackup, raw[StorageKeys.pays] as string]);
    writes.push([StorageKeys.pays, JSON.stringify(paysNghinToVnd(pays))]);
  }
  writes.push([StorageKeys.billMoneyUnit, VND_UNIT_MARK]);
  await setRawMany(writes);
}
