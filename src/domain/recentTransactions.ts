/**
 * "Giao dịch gần đây" của Tổng quan (hàm thuần): gộp từ các nguồn dữ liệu đã có, KHÔNG tạo kho dữ liệu riêng.
 *
 * Chỉ coi là giao dịch tiền thực tế của TÔI:
 * - Khoản chi cá nhân (kể cả khoản tự ghi từ chia bill `src:'cb'` và phần đóng quỹ của tôi `src:'quy'`): tiền ra.
 * - Khoản trả / chuyển tiền có "Tôi" ở một đầu: tôi chuyển đi = tiền ra, người khác chuyển cho tôi = tiền vào.
 * KHÔNG tính: bản ghi bill, số dư công nợ, số dư quỹ, lần đóng / chi quỹ (dữ liệu quỹ; phần đóng quỹ của tôi đã có dạng khoản chi cá nhân), khoản gộp nợ (`bt`, chỉ là bù trừ sổ),
 * và khoản trả giữa hai người không phải tôi.
 *
 * Chống trùng: một khoản trả của tôi có thể đã sinh khoản chi cá nhân `cb` ("Trả An · bill 06/10", liên kết bằng `pay.exp`).
 * Khoản chi đó là bóng của khoản trả, nên chỉ hiện dòng khoản trả, bỏ các khoản chi được `pay.exp` trỏ tới.
 * Tiền: khoản chi và khoản trả đều lưu ĐỒNG.
 */

import { isOwnerName } from '@/domain/funds';
import { payClass } from '@/domain/ledger';
import type { DateStr, ExpenseWithId } from '@/types/expense';
import type { Vnd } from '@/types/money';
import type { Pay } from '@/types/pay';
import { monthOf } from '@/utils/date';

export type RecentKind = 'expense' | 'pay';

export interface RecentTransaction {
  /** Khoá duy nhất: `expense:<tháng>/<id>` hoặc `pay:<id>`. */
  key: string;
  kind: RecentKind;
  date: DateStr;
  /** Thứ tự trong ngày (thời điểm tạo, ms). */
  order: number;
  title: string;
  subtitle: string;
  /** Loại giao dịch hiển thị: "Chi tiêu", "Chia bill", "Quỹ nhóm", "Chuyển tiền", "Trả bill". */
  typeLabel: string;
  /** Số tiền (đồng, dương) và chiều tiền theo góc nhìn của tôi. */
  amount: Vnd;
  flow: 'out' | 'in';
  /** Mục chi (chỉ với khoản chi). */
  categoryId?: string;
  /** Dùng để mở chi tiết: khoản chi `{ m, id }` hoặc mã khoản trả. */
  expense?: { m: string; id: string };
  payId?: string;
}

const clean = (name: unknown): string => String(name || '').trim();

export interface RecentInput {
  expenses: readonly ExpenseWithId[];
  pays: readonly Pay[];
  /** Tên mục chi từ mã mục. */
  categoryName: (id: string) => string;
  limit: number;
}

const SOURCE_LABEL: Record<string, string> = { cb: 'Chia bill', quy: 'Quỹ nhóm' };

/** Các giao dịch mới nhất (ngày giảm dần, cùng ngày thì tạo sau trước), tối đa `limit`. */
export function buildRecentTransactions({ expenses, pays, categoryName, limit }: RecentInput): RecentTransaction[] {
  // Khoản chi là "bóng" của khoản trả (pay.exp trỏ tới) thì bỏ.
  const shadowed = new Set<string>();
  for (const pay of pays) for (const ref of pay.exp ?? []) shadowed.add(`${ref.m}/${ref.id}`);

  const list: RecentTransaction[] = [];

  for (const item of expenses) {
    const month = monthOf(item.d);
    if (shadowed.has(`${month}/${item.id}`)) continue;
    const name = categoryName(item.c);
    list.push({
      key: `expense:${month}/${item.id}`,
      kind: 'expense',
      date: item.d,
      order: item.t || 0,
      title: item.n || name,
      // Ghi chú của khoản chi từ chia bill có dạng "Chia bill dd/mm · N người ...": bỏ phần số người cho gọn.
      subtitle: (item.src === 'cb' ? (item.i ?? '').replace(/s*·s*d+ người/, '') : item.i) || name,
      typeLabel: (item.src && SOURCE_LABEL[item.src]) || 'Chi tiêu',
      amount: item.a,
      flow: 'out',
      categoryId: item.c,
      expense: { m: month, id: item.id },
    });
  }

  for (const pay of pays) {
    const amount = Math.round(+pay.amt || 0);
    if (!(amount > 0)) continue;
    const cls = payClass(pay);
    if (cls === 'bt') continue;
    const from = clean(pay.from);
    const to = clean(pay.to);
    const out = isOwnerName(from) && !isOwnerName(to);
    const incoming = isOwnerName(to) && !isOwnerName(from);
    if (!out && !incoming) continue;
    const bill = cls === 'bill';
    const typeLabel = bill ? 'Trả bill' : 'Chuyển tiền';
    const note = clean(pay.note);
    list.push({
      key: `pay:${pay.id}`,
      kind: 'pay',
      date: String(pay.date),
      order: pay.createdAt || 0,
      title: out ? `${bill ? 'Trả bill cho' : 'Chuyển cho'} ${to}` : `${from} ${bill ? 'trả bill cho tôi' : 'chuyển cho tôi'}`,
      subtitle: note || typeLabel,
      typeLabel,
      amount,
      flow: out ? 'out' : 'in',
      payId: pay.id,
    });
  }

  return list
    .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order || b.key.localeCompare(a.key))
    .slice(0, Math.max(0, limit));
}
