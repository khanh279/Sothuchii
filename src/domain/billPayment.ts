/**
 * Trạng thái thanh toán của từng khoản "Cần chuyển" của một bill và của cả bill (hàm thuần, chỉ ĐỌC dữ liệu). Tiền là ĐỒNG.
 *
 * Dùng phân bổ chung `allocateBillPayments` (`billAllocation.ts`): mỗi khoản trả thuộc sổ bill (kể cả gộp nợ sổ bill) từ A cho B trừ dần vào các
 * khoản "A phải chuyển cho B" của các bill, bill cũ trước, áp cho MỌI cặp người. Ở đây chỉ đổi kết quả đó thành trạng thái "đã trả / một phần / chưa".
 * Không ghi nhận / sửa bất cứ giao dịch nào; trả dư thì phần dư không thuộc khoản chuyển nào.
 */

import { allocateBillPayments } from '@/domain/billAllocation';
import { DEBT_ZERO } from '@/domain/ledger';
import type { Bill } from '@/types/bill';
import type { Vnd } from '@/types/money';
import type { Pay } from '@/types/pay';
import { roundVnd } from '@/domain/money';

export type TransferPayState = 'paid' | 'unpaid' | 'partial';

export interface BillTransferStatus {
  from: string;
  to: string;
  /** Tổng số tiền cần chuyển theo bill. */
  amount: Vnd;
  /** Đã trả (đã phân bổ vào khoản chuyển này) và còn thiếu. */
  paid: Vnd;
  remaining: Vnd;
  state: TransferPayState;
}

/** Trạng thái các khoản cần chuyển của MỌI bill (khoá: mã bill), mỗi khoản đúng thứ tự của `computeSplit(...).transfers`. */
export function billTransferStatuses(bills: readonly Bill[], pays: readonly Pay[]): Map<string, BillTransferStatus[]> {
  const result = new Map<string, BillTransferStatus[]>();
  for (const [billId, slots] of allocateBillPayments(bills, pays).byBill) {
    result.set(
      billId,
      slots.map((slot) => {
        const remaining = slot.left < DEBT_ZERO ? 0 : slot.left;
        const paid = roundVnd(slot.amount - remaining);
        const state: TransferPayState = remaining <= 0 ? 'paid' : paid < DEBT_ZERO ? 'unpaid' : 'partial';
        return { from: slot.from, to: slot.to, amount: slot.amount, paid, remaining, state };
      }),
    );
  }
  return result;
}

/**
 * Trạng thái chung của cả bill ở danh sách: "Đã thanh toán" chỉ khi MỌI khoản cần chuyển đã hoàn thành (bill không có khoản nào cần chuyển
 * — ví dụ chỉ một người hoặc mọi người đã cân bằng — không còn gì phải trả nên cũng là đã thanh toán); còn lại là "Chưa thanh toán",
 * kể cả khi mới thanh toán một phần.
 */
export function billSettled(statuses: readonly BillTransferStatus[] | undefined): boolean {
  return (statuses ?? []).every((status) => status.state === 'paid');
}

export const TRANSFER_STATE_LABEL: Record<TransferPayState, string> = {
  paid: 'Đã thanh toán',
  unpaid: 'Chưa thanh toán',
  partial: 'Thanh toán một phần',
};
