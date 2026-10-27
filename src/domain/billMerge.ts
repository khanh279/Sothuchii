/**
 * Gộp nhiều bill thành MỘT bill tổng thể để xem và thanh toán chung (hàm thuần, chỉ ĐỌC dữ liệu; không tạo, sửa hay xoá bill nào). Tiền là ĐỒNG.
 *
 * Phần của từng người là tổng các phần của họ ở từng bill, mỗi bill tính bằng `computeSplit` (người không có mặt ở một bill thì bill đó
 * tính 0 cho họ). Số còn phải thanh toán KHÔNG tính lại ở đây: lấy từ `buildBillPairsFor`, đã trừ các khoản trả thực tế theo quy tắc phân bổ
 * "bill cũ trước" có sẵn, nên khoản trả ghi ở bất kỳ nơi nào đều được phản ánh.
 */

import { computeSplit } from '@/domain/bills';
import { billTotal } from '@/domain/billHistory';
import type { Bill } from '@/types/bill';
import type { Vnd } from '@/types/money';

export interface MergedPerson {
  name: string;
  /** Tổng số tiền người này đã chi ở các bill gộp. */
  paid: Vnd;
  /** Tổng phần người này phải chịu. */
  share: Vnd;
  /** `paid − share`: dương là được nhận lại, âm là còn thiếu. */
  net: Vnd;
}

export interface MergedBill {
  /** Các bill được gộp, cũ → mới. */
  bills: Bill[];
  /** Tổng tiền các bill. */
  total: Vnd;
  people: MergedPerson[];
  /** Ngày bill sớm nhất và muộn nhất. */
  from: string;
  to: string;
  /** Có bill lỗi mức cố định (không chia được): phần của bill đó không được tính vào từng người. */
  hasBad: boolean;
}

const clean = (name: unknown): string => String(name || '').trim();

/** Ít nhất 2 bill mới gộp được. */
export const MIN_MERGE_BILLS = 2;

/** Gộp các bill có mã trong `ids` (mã không tồn tại bị bỏ qua). */
export function mergeBills(bills: readonly Bill[], ids: readonly string[]): MergedBill {
  const picked = new Set(ids);
  const chosen = bills
    .filter((bill) => picked.has(bill.id))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0));

  const people = new Map<string, MergedPerson>();
  let hasBad = false;
  for (const bill of chosen) {
    const split = computeSplit(bill.people);
    if (split.bad) {
      hasBad = true;
      continue;
    }
    for (const row of split.rows) {
      const name = clean(row.name);
      const entry = people.get(name) ?? { name, paid: 0, share: 0, net: 0 };
      entry.paid += row.paid;
      entry.share += row.share;
      people.set(name, entry);
    }
  }
  for (const person of people.values()) {
    person.paid = Math.round(person.paid);
    person.share = Math.round(person.share);
    person.net = person.paid - person.share;
  }

  return {
    bills: chosen,
    total: chosen.reduce((sum, bill) => sum + billTotal(bill), 0),
    people: [...people.values()],
    from: chosen[0]?.date ?? '',
    to: chosen[chosen.length - 1]?.date ?? '',
    hasBad,
  };
}
