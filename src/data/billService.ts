/**
 * Thao tác Chia bill dành cho giao diện: ghi thay đổi rồi đồng bộ sang chi tiêu cá nhân (như PWA: lưu xong mới
 * đồng bộ). Thay đổi đã ghi thì không bị huỷ nếu đồng bộ lỗi; lần đồng bộ sau sẽ làm tiếp.
 */

import { deleteBill, saveBill, saveBillNames, type BillInput } from '@/data/billRepository';
import { syncBillExpenses } from '@/data/billSync';

export interface SyncedBillChange<T> {
  value: T;
  /** true nếu thay đổi đã lưu nhưng bước đồng bộ sang chi tiêu cá nhân bị lỗi. */
  syncFailed: boolean;
}

async function thenSync<T>(value: T): Promise<SyncedBillChange<T>> {
  try {
    await syncBillExpenses();
    return { value, syncFailed: false };
  } catch {
    return { value, syncFailed: true };
  }
}

/**
 * Lưu bill, nhớ nhóm người cho lần chia sau (`chiabill:names`, như PWA), rồi đồng bộ.
 * Trả về id bill; `null` nếu đang sửa một bill không còn tồn tại.
 */
export async function saveBillSynced(input: BillInput): Promise<SyncedBillChange<string | null>> {
  const id = await saveBill(input);
  if (id !== null) await saveBillNames(input.people.map((person) => person.name));
  return thenSync(id);
}

/** Xoá bill; khoản chi cá nhân liên kết bị dọn trong bước đồng bộ. */
export async function deleteBillSynced(id: string): Promise<SyncedBillChange<boolean>> {
  return thenSync(await deleteBill(id));
}
