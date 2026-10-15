/**
 * Đồng bộ phần chi tiêu cá nhân của các lần đóng quỹ (hàm `wt` của PWA).
 * Phần quyết định nằm ở `planFundExpenseSync` (thuần, đã có test); file này chỉ ĐỌC trạng thái, gọi kế hoạch,
 * rồi thực hiện từng hành động qua hợp đồng `expenseApi` và ghi lại `contrib.exp`.
 *
 * Thứ tự an toàn: TẠO khoản mới trước, rồi mới xoá khoản cũ, rồi mới ghi liên kết. Nếu dừng giữa chừng thì
 * tệ nhất là có khoản `src:'quy'` mồ côi (lần đồng bộ sau tự dọn), không bao giờ mất tiền đã ghi.
 *
 * Khác PWA, có chủ ý (chặt hơn):
 * - Không có dữ liệu Quỹ hợp lệ (chưa lưu, hoặc `contribs`/`expenses` không phải mảng) thì BỎ QUA hoàn toàn,
 *   kể cả bước dọn khoản mồ côi, để không xoá chi tiêu `src:'quy'` chỉ vì kho Quỹ bị mất.
 * - Chỉ xoá khoản mang `src:'quy'` (xem `planFundExpenseSync`).
 * - Một hành động lỗi (ví dụ ngày sai) không chặn các hành động còn lại; lỗi được báo trong kết quả.
 */

import { ExpenseInputError, addExp, delExp, getExp, listSrc } from '@/data/expenseApi';
import { readFundRaw, setContributionLinks, type ContributionLink } from '@/data/fundRepository';
import { normalizeFundData, planFundExpenseSync, type FundSyncAction, type LinkedExpenseSnapshot } from '@/domain/funds';
import type { ExpenseRef } from '@/types/expense';

export interface FundSyncResult {
  /** Lý do bỏ qua toàn bộ; không có = đã chạy. */
  skipped?: 'no-fund-data';
  added: number;
  replaced: number;
  unlinked: number;
  orphansRemoved: number;
  /** Số liên kết `contrib.exp` thực sự được ghi lại. */
  linksWritten: number;
  /** Thông báo cho từng hành động lỗi (đã bỏ qua). */
  failed: string[];
}

const keyOf = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;

// Mỗi lần đồng bộ chạy xong rồi mới đến lần sau, kể cả khi giao diện gọi dồn.
let tail: Promise<unknown> = Promise.resolve();

export function syncFundExpenses(): Promise<FundSyncResult> {
  const run = tail.then(doSync);
  tail = run.catch(() => undefined);
  return run;
}

async function doSync(): Promise<FundSyncResult> {
  const result: FundSyncResult = { added: 0, replaced: 0, unlinked: 0, orphansRemoved: 0, linksWritten: 0, failed: [] };

  const raw = await readFundRaw();
  if (!raw || !Array.isArray(raw.contribs) || !Array.isArray(raw.expenses)) return { ...result, skipped: 'no-fund-data' };

  // Lần đóng thiếu id không thể liên kết được (mỗi lần đọc sẽ sinh id khác), nên không đưa vào kế hoạch.
  const data = normalizeFundData(raw, { newId: () => '' });
  const contribs = data.contribs.filter((contribution) => contribution.id !== '');

  const snapshots = new Map<string, LinkedExpenseSnapshot | null>();
  for (const contribution of contribs) {
    if (!contribution.exp) continue;
    const found = await getExp(contribution.exp);
    snapshots.set(keyOf(contribution.exp), found);
  }
  const quyRefs = await listSrc('quy');

  const plan = planFundExpenseSync({
    data: { funds: data.funds, contribs },
    lookup: (ref) => snapshots.get(keyOf(ref)) ?? null,
    quyRefs,
  });

  const links: ContributionLink[] = [];
  for (const action of plan) {
    try {
      await perform(action, links, result);
    } catch (error) {
      if (!(error instanceof ExpenseInputError)) throw error; // lỗi lưu trữ/dữ liệu hỏng: dừng, không đoán
      result.failed.push(error.message);
    }
  }

  if (links.length) result.linksWritten = await setContributionLinks(links);
  return result;
}

async function perform(action: FundSyncAction, links: ContributionLink[], result: FundSyncResult): Promise<void> {
  switch (action.type) {
    case 'add':
      links.push({ contribId: action.contribId, exp: await addExp(action.expense) });
      result.added++;
      return;
    case 'replace': {
      const created = await addExp(action.expense); // tạo mới trước
      if (action.remove) await delExp(action.remove); // rồi mới xoá khoản cũ
      links.push({ contribId: action.contribId, exp: created });
      result.replaced++;
      return;
    }
    case 'unlink':
      if (action.remove) await delExp(action.remove);
      links.push({ contribId: action.contribId, exp: null });
      result.unlinked++;
      return;
    case 'delete-orphan':
      if (await delExp(action.remove)) result.orphansRemoved++;
      return;
  }
}
