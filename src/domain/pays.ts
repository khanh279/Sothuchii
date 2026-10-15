/**
 * Khoản thanh toán (`chiabill:v2:pays`): đọc an toàn và gộp khoản trùng khi lưu. Chuyển từ `Tt`/`re` của PWA.
 * Chỉ đọc schema `v2`, không chạy migration cũ. Trường `nexp` của bản PWA cũ được BỎ QUA hoàn toàn.
 */

import { isReconciliation } from '@/domain/ledger';
import type { ExpenseRef } from '@/types/expense';
import type { Pay } from '@/types/pay';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function refOf(value: unknown): ExpenseRef | null {
  return isRecord(value) && value.m && value.id ? { m: String(value.m), id: String(value.id) } : null;
}

/**
 * Đọc dữ liệu thô thành danh sách an toàn để HIỂN THỊ và TÍNH. Bỏ mục không phải đối tượng; mục thiếu `id` vẫn được tính
 * vào số dư nhưng không liên kết được với khoản chi. `exp` nhận cả dạng mảng (PWA ghi) lẫn một đối tượng đơn lẻ.
 * Kết quả không giữ trường lạ; khi ghi (5B) phải sửa trên bản thô.
 */
export function normalizePays(raw: unknown): Pay[] {
  const pays: Pay[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isRecord(item)) continue;
    const pay: Pay = {
      id: item.id == null ? '' : String(item.id),
      createdAt: +(item.createdAt as number) || 0,
      date: String(item.date ?? ''),
      note: String(item.note ?? ''),
      from: String(item.from ?? ''),
      to: String(item.to ?? ''),
      amt: +(item.amt as number) || 0,
    };
    if (typeof item.kind === 'string') pay.kind = item.kind;
    if (item.bill) pay.bill = String(item.bill);
    if (Array.isArray(item.bills)) pay.bills = item.bills.map(String);
    if (item.item) pay.item = item.item;
    if (typeof item.lbl === 'string') pay.lbl = item.lbl;
    if (item.ds) pay.ds = item.ds;
    if (item.grp) pay.grp = String(item.grp);
    if (typeof item.led === 'string') pay.led = item.led;
    const refs = (Array.isArray(item.exp) ? item.exp : item.exp ? [item.exp] : []).map(refOf).filter((ref): ref is ExpenseRef => !!ref);
    if (refs.length) pay.exp = refs;
    pays.push(pay);
  }
  return pays;
}

/** Mọi tham chiếu khoản chi cá nhân mà các khoản trả đang dùng. */
export function payExpenseRefs(pays: readonly Pay[]): ExpenseRef[] {
  return pays.flatMap((pay) => pay.exp ?? []);
}

/**
 * Khóa nhận ra hai khoản trùng nhau (`re`): cùng ngày, người trả, người nhận, loại, bill, item, sổ, nhóm, ghi chú và
 * cùng là/không là "Đối soát". Khoản có `bills` (thanh toán nhiều bill) lấy chính `id` làm khóa nên không bao giờ bị gộp.
 */
export function payDedupeKey(pay: Pay): string {
  return [
    pay.id && pay.bills ? pay.id : '',
    pay.grp || '',
    pay.date,
    pay.from.trim(),
    pay.to.trim(),
    pay.kind || '',
    pay.bill || '',
    pay.item ? String(pay.item) : '',
    pay.led || '',
    isReconciliation(pay) ? 1 : 0,
    pay.note.trim(),
  ].join('|');
}

export interface DedupeResult {
  pays: Pay[];
  /** Các khoản bị gộp vào khoản đầu tiên cùng khóa (khoản chi cá nhân của chúng phải được dọn). */
  removed: Pay[];
}

/**
 * Gộp khoản trùng (`Tt`): giữ khoản đầu tiên của mỗi khóa và CỘNG số tiền các khoản sau vào đó (làm tròn từng đồng).
 * Chỉ dùng khi LƯU, không dùng khi đọc.
 *
 * `locked`: mã các khoản không được gộp theo cả hai chiều — dùng cho khoản đang được SỬA, để việc sửa không bao giờ
 * cộng tiền của khoản này vào khoản khác (hoặc ngược lại) và không làm mất bản ghi vừa sửa.
 */
export function dedupePays(pays: readonly Pay[], locked: ReadonlySet<string> = new Set()): DedupeResult {
  const first = new Map<string, Pay>();
  const result: Pay[] = [];
  const removed: Pay[] = [];
  for (const pay of pays) {
    const key = locked.has(pay.id) ? `${payDedupeKey(pay)}|#locked:${pay.id}` : payDedupeKey(pay);
    const kept = first.get(key);
    if (kept) {
      kept.amt = Math.round(((+kept.amt || 0) + (+pay.amt || 0)) * 1e3) / 1e3;
      removed.push(pay);
    } else {
      const copy = { ...pay };
      first.set(key, copy);
      result.push(copy);
    }
  }
  return { pays: result, removed };
}
