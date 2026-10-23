/**
 * Thao tác Quỹ dành cho giao diện: ghi thay đổi vào kho Quỹ rồi đồng bộ sang chi tiêu cá nhân,
 * giống `M()` của PWA (lưu xong mới đồng bộ). Thay đổi đã ghi thì không bị huỷ nếu đồng bộ lỗi;
 * lần đồng bộ sau (mở lại màn hình) sẽ làm tiếp.
 */

import {
  createAdvance,
  createFund,
  deleteAdvance,
  deleteContribution,
  deleteFund,
  deleteFundExpense,
  deleteFundTxn,
  renameFund,
  saveContribution,
  saveFundExpense,
  saveFundTxn,
  updateAdvance,
  updateFundTxn,
  type AdvanceInput,
  type ContributionInput,
  type AdvanceUpdate,
  type FundExpenseInput,
  type FundTxnInput,
  type FundTxnUpdate,
} from '@/data/fundRepository';
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

/** Thêm/sửa lần đóng quỹ; phần của "Tôi" được đồng bộ sang chi tiêu cá nhân. Giá trị trả về là id (null nếu không thấy). */
export async function saveContributionSynced(input: ContributionInput): Promise<SyncedChange<string | null>> {
  return thenSync(await saveContribution(input));
}

/** Xoá lần đóng quỹ; khoản chi cá nhân liên kết bị dọn trong bước đồng bộ. */
export async function deleteContributionSynced(id: string): Promise<SyncedChange<boolean>> {
  return thenSync(await deleteContribution(id));
}

/** Khoản chi quỹ không sinh khoản chi cá nhân, nhưng vẫn chạy đồng bộ để mọi thao tác Quỹ cùng một đường. */
export async function saveFundExpenseSynced(input: FundExpenseInput): Promise<SyncedChange<string | null>> {
  return thenSync(await saveFundExpense(input));
}

export async function deleteFundExpenseSynced(id: string): Promise<SyncedChange<boolean>> {
  return thenSync(await deleteFundExpense(id));
}

/** Xoá quỹ; các khoản chi cá nhân tạo từ lần đóng của quỹ đó được dọn trong bước đồng bộ. */
export async function deleteFundSynced(id: string): Promise<SyncedChange<boolean>> {
  return thenSync(await deleteFund(id));
}

/** Giao tiền ứng trước (hồ sơ ứng trước); không sinh khoản chi cá nhân nên chỉ chạy đồng bộ để cùng một đường với các thao tác Quỹ khác. */
export async function createAdvanceSynced(input: AdvanceInput): Promise<SyncedChange<string>> {
  return thenSync(await createAdvance(input));
}

/** Sửa hồ sơ giao tiền ứng (nội dung, ngày, số tiền giao). */
export async function updateAdvanceSynced(id: string, input: AdvanceUpdate): Promise<SyncedChange<boolean>> {
  return thenSync(await updateAdvance(id, input));
}

export async function deleteAdvanceSynced(id: string): Promise<SyncedChange<boolean>> {
  return thenSync(await deleteAdvance(id));
}

/** Hoàn tiền ứng / thanh toán cho cá nhân (chỉ dòng tiền và công nợ, không có chi phí mới). */
export async function saveFundTxnSynced(input: FundTxnInput): Promise<SyncedChange<string>> {
  return thenSync(await saveFundTxn(input));
}

/** Sửa số tiền / ngày của giao dịch hoàn tiền ứng hoặc thanh toán cho cá nhân. */
export async function updateFundTxnSynced(id: string, input: FundTxnUpdate): Promise<SyncedChange<boolean>> {
  return thenSync(await updateFundTxn(id, input));
}

export async function deleteFundTxnSynced(id: string): Promise<SyncedChange<boolean>> {
  return thenSync(await deleteFundTxn(id));
}
