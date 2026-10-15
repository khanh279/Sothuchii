/**
 * Đồng bộ chi tiêu cá nhân của Chia bill VÀ Công nợ (hàm `N()` của PWA): khoản chi `src:'cb'` của từng bill (phần của "Tôi")
 * và các khoản chi sinh từ khoản trả nợ bill (phân bổ vào bill còn nợ). Quyết định nằm ở `planDebtExpenseSync` (thuần, đã có
 * test); file này chỉ ĐỌC trạng thái, gọi kế hoạch, thực hiện từng hành động qua hợp đồng `expenseApi` rồi ghi lại liên kết.
 *
 * Thứ tự an toàn: TẠO khoản mới trước, rồi xoá khoản cũ, rồi ghi liên kết, rồi mới dọn mồ côi. Dừng giữa chừng thì tệ nhất là có
 * khoản `src:'cb'` mồ côi (lần đồng bộ sau tự dọn), không bao giờ mất tiền đã ghi.
 *
 * Khác PWA, có chủ ý (chặt hơn):
 * - Không có dữ liệu bill hợp lệ (chưa lưu, hoặc không phải mảng) thì BỎ QUA hoàn toàn, kể cả dọn mồ côi.
 * - Dữ liệu khoản trả hỏng thì dừng và báo lỗi, không đoán và không xoá gì.
 * - Mồ côi chỉ tính khi KHÔNG bill nào và KHÔNG khoản trả nào trỏ tới; chỉ xoá khoản mang `src:'cb'`.
 * - Một hành động lỗi (ví dụ ngày sai) không chặn các hành động còn lại; lỗi được báo trong kết quả.
 * - Trường `nexp` cũ không được đọc hay xoá.
 */

import { readBillsRaw, setBillLinks, type BillLink } from '@/data/billRepository';
import { ExpenseInputError, addExp, delExp, getExp, listSrc } from '@/data/expenseApi';
import { readPaysRaw, setPayLinks, type PayLink } from '@/data/payRepository';
import { normalizeBills, type BillSyncAction } from '@/domain/bills';
import type { LinkedExpenseSnapshot } from '@/domain/funds';
import { planDebtExpenseSync, type DesiredPayExpense, type PaySyncAction } from '@/domain/payExpenses';
import { normalizePays } from '@/domain/pays';
import type { ExpenseRef } from '@/types/expense';
import { isValidDateStr } from '@/utils/date';

export interface BillSyncResult {
  skipped?: 'no-bill-data';
  added: number;
  replaced: number;
  unlinked: number;
  /** Số khoản trả có danh sách khoản chi được tạo lại. */
  paysReplaced: number;
  /** Số khoản trả được bỏ liên kết (không còn khoản chi nào). */
  paysUnlinked: number;
  orphansRemoved: number;
  linksWritten: number;
  failed: string[];
}

const keyOf = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;

let tail: Promise<unknown> = Promise.resolve();

/** Đồng bộ bill + khoản trả. Các lần gọi dồn được xếp hàng, chạy lần lượt. */
export function syncBillExpenses(): Promise<BillSyncResult> {
  const run = tail.then(doSync);
  tail = run.catch(() => undefined);
  return run;
}

export const syncDebtExpenses = syncBillExpenses;

async function doSync(): Promise<BillSyncResult> {
  const result: BillSyncResult = { added: 0, replaced: 0, unlinked: 0, paysReplaced: 0, paysUnlinked: 0, orphansRemoved: 0, linksWritten: 0, failed: [] };

  const rawBills = await readBillsRaw();
  if (!rawBills) return { ...result, skipped: 'no-bill-data' };
  const rawPays = await readPaysRaw(); // JSON hỏng / sai kiểu → ném StorageCorruptError trước khi làm gì
  const bills = normalizeBills(rawBills);
  const pays = normalizePays(rawPays);

  const snapshots = new Map<string, LinkedExpenseSnapshot | null>();
  const refs = [...bills.flatMap((bill) => (bill.exp ? [bill.exp] : [])), ...pays.flatMap((pay) => pay.exp ?? [])];
  for (const ref of refs) if (!snapshots.has(keyOf(ref))) snapshots.set(keyOf(ref), await getExp(ref));

  const plan = planDebtExpenseSync({ bills, pays, lookup: (ref) => snapshots.get(keyOf(ref)) ?? null, cbRefs: await listSrc('cb') });

  const billLinks: BillLink[] = [];
  const payLinks: PayLink[] = [];
  for (const action of plan.bills) await guarded(result, () => performBill(action, billLinks, result));
  for (const action of plan.pays) await guarded(result, () => performPay(action, payLinks, result));

  if (billLinks.length) result.linksWritten += await setBillLinks(billLinks);
  if (payLinks.length) result.linksWritten += await setPayLinks(payLinks);

  // Dọn mồ côi SAU khi liên kết mới đã ghi, để không xoá nhầm khoản vừa tạo.
  for (const ref of plan.orphans) {
    if (await delExp(ref)) result.orphansRemoved++;
  }
  return result;
}

async function guarded(result: BillSyncResult, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    if (!(error instanceof ExpenseInputError)) throw error; // lỗi lưu trữ / dữ liệu hỏng: dừng, không đoán
    result.failed.push(error.message);
  }
}

async function performBill(action: BillSyncAction, links: BillLink[], result: BillSyncResult): Promise<void> {
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
      return; // mồ côi do kế hoạch chung xử lý
  }
}

/** Kiểm tra trước khi tạo để không để lại một nửa danh sách khoản chi khi có phần không hợp lệ. */
function assertCreatable(expenses: readonly DesiredPayExpense[]): void {
  for (const expense of expenses) {
    if (!isValidDateStr(expense.d)) throw new ExpenseInputError('Ngày không hợp lệ.');
    if (!(Math.round(expense.a) > 0)) throw new ExpenseInputError('Số tiền phải lớn hơn 0.');
  }
}

async function performPay(action: PaySyncAction, links: PayLink[], result: BillSyncResult): Promise<void> {
  if (action.type === 'replace') {
    assertCreatable(action.expenses);
    const created: ExpenseRef[] = [];
    for (const expense of action.expenses) created.push(await addExp(expense)); // tạo đủ danh sách mới trước
    for (const ref of action.remove) await delExp(ref); // rồi mới xoá các khoản cũ
    links.push({ payId: action.payId, exp: created });
    result.paysReplaced++;
    return;
  }
  for (const ref of action.remove) await delExp(ref);
  links.push({ payId: action.payId, exp: null });
  result.paysUnlinked++;
}
