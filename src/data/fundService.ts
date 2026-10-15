/**
 * Thao tác Quỹ dành cho giao diện: ghi thay đổi vào kho Quỹ rồi đồng bộ sang chi tiêu cá nhân,
 * giống `M()` của PWA (lưu xong mới đồng bộ). Thay đổi đã ghi thì không bị huỷ nếu đồng bộ lỗi;
 * lần đồng bộ sau (mở lại màn hình) sẽ làm tiếp.
 */

import { createFund, deleteFund, renameFund } from '@/data/fundRepository';
import { syncFundExpenses } from '@/data/fundSync';
import type { Fund } from '@/types/fund';

export interface SyncedChange<T> {
  value: T;
  /** true nếu thay đổi đã lưu nhưng bước đồng bộ sang chi tiêu cá nhân bị lỗi. */
  syncFailed: boolean;
}

async function thenSync<T>(value: T): Promise<SyncedChange<T>> {
  try {
    await syncFundExpenses();
    return { value, syncFailed: false };
  } catch {
    return { value, syncFailed: true };
  }
}

export async function createFundSynced(name: string): Promise<SyncedChange<Fund>> {
  return thenSync(await createFund(name));
}

export async function renameFundSynced(id: string, name: string): Promise<SyncedChange<boolean>> {
  return thenSync(await renameFund(id, name));
}

/** Xoá quỹ; các khoản chi cá nhân tạo từ lần đóng của quỹ đó được dọn trong bước đồng bộ. */
export async function deleteFundSynced(id: string): Promise<SyncedChange<boolean>> {
  return thenSync(await deleteFund(id));
}
