/**
 * Nội dung tin nhắn NHẮC NỢ (hàm thuần): liệt kê các khoản người kia đang nợ mình (nợ vay và nợ bill còn lại), tổng cộng và, nếu có, tài khoản để chuyển khoản. Văn bản thuần để gửi qua
 * Zalo, Messenger, SMS… Tiền là ĐỒNG; ngày hiện dd/mm/yyyy.
 */

import type { BankAccount } from '@/types/expense';
import type { Vnd } from '@/types/money';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';
import { bankByBin } from '@/domain/vnBanks';

export interface ReminderItem {
  title: string;
  /** Ngày của khoản (YYYY-MM-DD). */
  date: string;
  amount: Vnd;
}

export interface ReminderInput {
  /** Tên người nợ. */
  name: string;
  loans: readonly ReminderItem[];
  bills: readonly ReminderItem[];
  /** Tổng người đó còn nợ mình (đồng, > 0). */
  total: Vnd;
  /** Tài khoản của mình để họ chuyển khoản (tuỳ chọn). */
  bank?: BankAccount;
}

const line = (item: ReminderItem) => `• ${item.title || 'Khoản'} (${formatVnDate(item.date)}): ${formatVnd(item.amount)}`;

export function buildDebtReminder(input: ReminderInput): string {
  const parts = [`Chào ${input.name}, mình nhắc các khoản còn lại cần thanh toán:`];
  if (input.loans.length > 0) parts.push('', 'Nợ vay:', ...input.loans.map(line));
  if (input.bills.length > 0) parts.push('', 'Nợ bill:', ...input.bills.map(line));
  parts.push('', `Tổng cộng: ${formatVnd(input.total)}`);
  if (input.bank) {
    const bank = bankByBin(input.bank.bin);
    parts.push('', `Chuyển khoản: ${bank?.code ?? 'Ngân hàng'} ${input.bank.account}${input.bank.name ? ` (${input.bank.name})` : ''}`);
  }
  parts.push('', 'Cảm ơn bạn!');
  return parts.join('\n');
}
