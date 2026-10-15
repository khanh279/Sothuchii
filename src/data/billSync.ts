/**
 * Đồng bộ phần chi tiêu cá nhân của các bill (hàm `N()` của PWA). Quyết định nằm ở `planBillExpenseSync`
 * (thuần, đã có test); file này chỉ ĐỌC trạng thái, gọi kế hoạch, thực hiện từng hành động qua hợp đồng
 * `expenseApi` và ghi lại `bill.exp`.
 *
 * Thứ tự an toàn: TẠO khoản mới trước, rồi xoá khoản cũ, rồi ghi liên kết. Dừng giữa chừng thì tệ nhất là có
 * khoản `src:'cb'` mồ côi (lần đồng bộ sau tự dọn), không bao giờ mất tiền đã ghi.
 *
 * Khác PWA, có chủ ý (chặt hơn):
 * - Không có dữ liệu bill hợp lệ (chưa lưu, hoặc không phải mảng) thì BỎ QUA hoàn toàn, kể cả dọn mồ côi.
 * - Khoản `src:'cb'` đang được khoản trả nợ (`chiabill:v2:pays`, trường `exp`) dùng không bị coi là mồ côi.
 *   Nếu `pays` hỏng thì dừng và báo lỗi, không đoán.
 * - Chỉ xoá khoản mang `src:'cb'` (xem `planBillExpenseSync`).
 * - Một hành động lỗi (ví dụ ngày sai) không chặn các hành động còn lại; lỗi được báo trong kết quả.
 */

import { readBillsRaw, setBillLinks, type BillLink } from '@/data/billRepository';
import { ExpenseInputError, addExp, delExp, getExp, listSrc } from '@/data/expenseApi';
import { StorageKeys, loadJsonStrict } from '@/data/storage';
import { normalizeBills, planBillExpenseSync, type BillSyncAction } from '@/domain/bills';
import type { LinkedExpenseSnapshot } from '@/domain/funds';
import type { ExpenseRef } from '@/types/expense';

export interface BillSyncResult {
  skipped?: 'no-bill-data';
  added: number;
  replaced: number;
  unlinked: number;
  orphansRemoved: number;
  linksWritten: number;
  failed: string[];
}

const keyOf = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Tham chiếu khoản chi mà các khoản thanh toán (Công nợ) đang dùng; chỉ đọc. */
async function paymentRefs(): Promise<ExpenseRef[]> {
  const pays = await loadJsonStrict<unknown>(StorageKeys.pays); // JSON hỏng → ném StorageCorruptError
  const refs: ExpenseRef[] = [];
  for (const pay of Array.isArray(pays) ? pays : []) {
    if (!isRecord(pay)) continue;
    const list = Array.isArray(pay.exp) ? pay.exp : pay.exp ? [pay.exp] : [];
    for (const ref of list) if (isRecord(ref) && ref.m && ref.id) refs.push({ m: String(ref.m), id: String(ref.id) });
  }
  return refs;
}

let tail: Promise<unknown> = Promise.resolve();

export function syncBillExpenses(): Promise<BillSyncResult> {
  const run = tail.then(doSync);
  tail = run.catch(() => undefined);
  return run;
}

async function doSync(): Promise<BillSyncResult> {
  const result: BillSyncResult = { added: 0, replaced: 0, unlinked: 0, orphansRemoved: 0, linksWritten: 0, failed: [] };

  const raw = await readBillsRaw();
  if (!raw) return { ...result, skipped: 'no-bill-data' };

  const bills = normalizeBills(raw);
  const snapshots = new Map<string, LinkedExpenseSnapshot | null>();
  for (const bill of bills) {
    if (bill.exp) snapshots.set(keyOf(bill.exp), await getExp(bill.exp));
  }

  const plan = planBillExpenseSync({
    bills,
    lookup: (ref) => snapshots.get(keyOf(ref)) ?? null,
    cbRefs: await listSrc('cb'),
    otherReferenced: await paymentRefs(),
  });

  const links: BillLink[] = [];
  for (const action of plan) {
    try {
      await perform(action, links, result);
    } catch (error) {
      if (!(error instanceof ExpenseInputError)) throw error; // lỗi lưu trữ / dữ liệu hỏng: dừng, không đoán
      result.failed.push(error.message);
    }
  }

  if (links.length) result.linksWritten = await setBillLinks(links);
  return result;
}

async function perform(action: BillSyncAction, links: BillLink[], result: BillSyncResult): Promise<void> {
  switch (action.type) {
    case 'add':
      links.push({ billId: action.billId, exp: await addExp(action.expense) });
      result.added++;
      return;
    case 'replace': {
      const created = await addExp(action.expense); // tạo mới trước
      if (action.remove) await delExp(action.remove); // rồi mới xoá khoản cũ
      links.push({ billId: action.billId, exp: created });
      result.replaced++;
      return;
    }
    case 'unlink':
      if (action.remove) await delExp(action.remove);
      links.push({ billId: action.billId, exp: null });
      result.unlinked++;
      return;
    case 'delete-orphan':
      if (await delExp(action.remove)) result.orphansRemoved++;
      return;
  }
}
