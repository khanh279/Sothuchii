/**
 * Thao tác Công nợ dành cho giao diện: ghi thay đổi rồi đồng bộ chi tiêu cá nhân (như PWA: lưu xong mới đồng bộ).
 * Thay đổi đã ghi thì không bị huỷ nếu đồng bộ lỗi; lần đồng bộ sau sẽ làm tiếp.
 *
 * Số dư luôn tính lại từ dữ liệu hiện có ngay lúc ghi (không tin số đang hiển thị trên màn hình).
 */

import { loadBills, newBillId } from '@/data/billRepository';
import { syncBillExpenses } from '@/data/billSync';
import { PayInputError, appendPays, deletePayGroup, deletePays, loadPays, replacePayGroup, setPayNotes, updatePay, type PayPatch } from '@/data/payRepository';
import { debtPaymentMessage, planDebtPayment, type DebtPayOption } from '@/domain/debtPay';
import {
  checkUndoMerge,
  debtEvents,
  finalizeNewPays,
  mergeAmount,
  mergeDrafts,
  mergeMessage,
  newMergeGroupId,
  pairNet,
  pairPaymentDraft,
  paymentDraft,
  paymentMessage,
  personLedger,
  type PayDraft,
} from '@/domain/ledger';
import type { Ledger, Pay } from '@/types/pay';
import type { Period } from '@/types/expense';
import type { Nghin } from '@/types/money';
import { todayStr } from '@/utils/date';

export interface SyncedPayChange<T> {
  value: T;
  /** true nếu thay đổi đã lưu nhưng bước đồng bộ sang chi tiêu cá nhân bị lỗi. */
  syncFailed: boolean;
}

async function thenSync<T>(value: T): Promise<SyncedPayChange<T>> {
  try {
    await syncBillExpenses();
    return { value, syncFailed: false };
  } catch {
    return { value, syncFailed: true };
  }
}

/** Ghi các bản nháp thành khoản trả mới (`ot`), rồi đồng bộ. Trả về các khoản đã tạo. */
async function recordDrafts(drafts: readonly PayDraft[], group?: string): Promise<Pay[]> {
  const created = finalizeNewPays(drafts, { now: Date.now(), today: todayStr(), newId: () => newBillId(), group });
  if (created.length) await appendPays(created);
  return created;
}

export interface RecordResult {
  recorded: boolean;
  /** Câu thông báo cho giao diện; rỗng nếu không ghi gì. */
  message: string;
}

const NOTHING: RecordResult = { recorded: false, message: '' };

/** "Thanh toán toàn bộ" / "Một phần" với `name` ở sổ `ledger`. Không ghi gì nếu số tiền ≤ 0 hoặc sổ đã hết nợ. */
export async function recordPaymentSynced(name: string, ledger: Ledger, amount: Nghin): Promise<SyncedPayChange<RecordResult>> {
  const [bills, pays] = await Promise.all([loadBills(), loadPays()]);
  const draft = paymentDraft(personLedger(debtEvents(bills, pays), name), ledger, amount);
  if (!draft) return { value: NOTHING, syncFailed: false };
  await recordDrafts([draft]);
  return thenSync({ recorded: true, message: paymentMessage(draft) });
}

/**
 * "Thanh toán" với `name` theo 4 lựa chọn (nợ bill / nợ vay / một phần / toàn bộ), xem `planDebtPayment`.
 * Mọi khoản của một lần thanh toán được ghi trong MỘT lần lưu rồi mới đồng bộ. Không ghi gì nếu không có gì để trả
 * (ví dụ hai sổ trái dấu, số tiền ≤ 0).
 */
export async function recordDebtPaymentSynced(name: string, option: DebtPayOption, amount?: Nghin): Promise<SyncedPayChange<RecordResult>> {
  const [bills, pays] = await Promise.all([loadBills(), loadPays()]);
  const drafts = planDebtPayment(personLedger(debtEvents(bills, pays), name), option, amount);
  if (!drafts.length) return { value: NOTHING, syncFailed: false };
  await recordDrafts(drafts);
  return thenSync({ recorded: true, message: debtPaymentMessage(drafts) });
}

/** "Gộp nợ" với `name`: trừ giữa nợ vay và nợ bill. Không ghi gì nếu hai sổ không gộp được. */
export async function mergeDebtsSynced(name: string): Promise<SyncedPayChange<RecordResult>> {
  const [bills, pays] = await Promise.all([loadBills(), loadPays()]);
  const debt = personLedger(debtEvents(bills, pays), name);
  const amount = mergeAmount(debt);
  const drafts = mergeDrafts(debt);
  if (!drafts.length) return { value: NOTHING, syncFailed: false };
  await recordDrafts(drafts, newMergeGroupId(Date.now()));
  return thenSync({ recorded: true, message: mergeMessage(amount) });
}

/**
 * "Hoàn tác" một lần gộp nợ (bỏ mọi khoản cùng nhóm). Trả về số khoản đã bỏ.
 * Nếu sau lần gộp đã có giao dịch mới với người đó thì từ chối (ném `PayInputError`) và không sửa gì.
 */
export async function undoMergeSynced(group: string): Promise<SyncedPayChange<number>> {
  const [bills, pays] = await Promise.all([loadBills(), loadPays()]);
  const check = checkUndoMerge(bills, pays, group);
  if (!check.ok) throw new PayInputError(check.message);
  return thenSync(await deletePayGroup(group));
}

/** "Thanh toán toàn bộ" cho cả cặp `x` – `z` trong kỳ đang xem. */
export async function recordPairPaymentSynced(x: string, z: string, period: Period): Promise<SyncedPayChange<RecordResult>> {
  const [bills, pays] = await Promise.all([loadBills(), loadPays()]);
  const draft = pairPaymentDraft(pairNet(bills, pays, x, z, period));
  if (!draft) return { value: NOTHING, syncFailed: false };
  await recordDrafts([draft]);
  return thenSync({ recorded: true, message: paymentMessage(draft) });
}

export interface TransferInput {
  date: string;
  note: string;
  from: string;
  to: string;
  amt: Nghin;
  /** 'vay' (Chuyển tiền) | 'billpay' (Trả bill). */
  kind: 'vay' | 'billpay';
}

/** Form "Ghi nhận": thêm một khoản chuyển tiền / trả bill. Khoản giống hệt khoản đã có (cùng ngày, người, loại, ghi chú) được cộng vào đó. */
export async function addTransferSynced(input: TransferInput): Promise<SyncedPayChange<string>> {
  const pay: Pay = { id: newBillId(), createdAt: Date.now(), date: input.date, note: input.note.trim(), from: input.from, to: input.to, amt: input.amt, kind: input.kind };
  await appendPays([pay]);
  return thenSync(pay.id);
}

/** Form "Lưu thay đổi": sửa một khoản (xem `updatePay`; khoản đang sửa không bị gộp với khoản khác). */
export async function updateTransferSynced(id: string, patch: PayPatch): Promise<SyncedPayChange<boolean>> {
  return thenSync(await updatePay(id, { ...patch, note: patch.note.trim() }));
}

/** Sửa một nhóm khoản trả bill hiển thị chung: chỉ đổi ghi chú nếu không đổi gì khác, ngược lại thay cả nhóm bằng một khoản. */
export async function updatePayGroupSynced(
  ids: readonly string[],
  original: { date: string; from: string; to: string; amt: Nghin },
  patch: { date: string; note: string; from: string; to: string; amt: Nghin },
): Promise<SyncedPayChange<boolean>> {
  const unchanged = Math.abs(patch.amt - original.amt) < 5e-4 && patch.from === original.from && patch.to === original.to && patch.date === original.date;
  if (unchanged) return thenSync((await setPayNotes(ids, patch.note.trim())) > 0);
  const pays = await loadPays();
  const billIds = [...new Set(pays.filter((pay) => ids.includes(pay.id)).flatMap((pay) => pay.bills ?? (pay.bill ? [pay.bill] : [])))];
  const replacement: Pay = {
    id: newBillId(),
    createdAt: Date.now(),
    date: patch.date,
    note: patch.note.trim(),
    from: patch.from,
    to: patch.to,
    amt: patch.amt,
    kind: 'repay',
    bills: billIds,
    lbl: 'Thanh toán bill',
  };
  return thenSync(await replacePayGroup(ids, replacement));
}

/** Xoá khoản trả (hoặc cả nhóm hiển thị chung); khoản chi cá nhân liên kết bị dọn trong bước đồng bộ. */
export async function deletePaySynced(ids: readonly string[]): Promise<SyncedPayChange<number>> {
  return thenSync(await deletePays(ids));
}
