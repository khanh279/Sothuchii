/**
 * Gợi ý cho "Chụp nhanh" (hàm thuần): không nhận diện ảnh, chỉ gom các khoản đã nhập trước đây theo nội dung để gợi ý lại nội dung và số tiền hay dùng.
 * Mỗi nội dung (không phân biệt hoa thường, bỏ khoảng trắng thừa) thành một gợi ý: số tiền là của LẦN GẦN NHẤT, xếp theo số lần dùng rồi đến ngày gần nhất.
 */

import type { DateStr } from '@/types/expense';
import type { Vnd } from '@/types/money';

/** Nguồn chi mà "Chụp nhanh" chuyển sang: chi tiêu cá nhân, chia bill hoặc chi tiêu quỹ. */
export type QuickSource = 'personal' | 'bill' | 'fund';

export interface QuickHistoryItem {
  title: string;
  amount: Vnd;
  date: DateStr;
}

export interface QuickSuggestion {
  title: string;
  /** Số tiền của lần gần nhất dùng nội dung này (đồng). */
  amount: Vnd;
  /** Số lần đã dùng. */
  count: number;
  lastDate: DateStr;
}

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

export function suggestFromHistory(items: readonly QuickHistoryItem[], limit = 6, query = ''): QuickSuggestion[] {
  const byTitle = new Map<string, QuickSuggestion>();
  for (const item of items) {
    const title = item.title.trim().replace(/\s+/g, ' ');
    if (!title || !(item.amount > 0)) continue;
    const key = normalize(title);
    const found = byTitle.get(key);
    if (!found) {
      byTitle.set(key, { title, amount: item.amount, count: 1, lastDate: item.date });
    } else {
      found.count += 1;
      if (item.date >= found.lastDate) {
        found.lastDate = item.date;
        found.amount = item.amount;
        found.title = title;
      }
    }
  }
  const needle = normalize(query);
  return [...byTitle.entries()]
    .filter(([key]) => !needle || key.includes(needle))
    .map(([, value]) => value)
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) || a.title.localeCompare(b.title))
    .slice(0, Math.max(0, limit));
}
