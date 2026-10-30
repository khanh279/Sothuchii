import { dueRecurring, markDone } from '@/domain/recurring';
import { todayStr } from '@/utils/date';

import { ExpenseIdExistsError, createExpense, loadSettings, saveSettings } from './expenseRepository';

/**
 * Ghi các khoản chi tiêu định kỳ đã đến hạn (xem `domain/recurring`): mỗi khoản dùng mã cố định `rec-<quy tắc>-<tháng>` nên chạy lại hay chạy song song không ghi trùng (khoản đã có thì bỏ qua);
 * ghi xong mới đánh dấu tháng đã xử lý trong thiết lập, để khoản người dùng đã xoá sau đó không bị ghi lại. Trả về số khoản mới ghi.
 */
export async function applyRecurring(today: string = todayStr(), now: number = Date.now()): Promise<number> {
  const settings = await loadSettings();
  const rules = settings.recurring ?? [];
  if (rules.length === 0) return 0;
  const due = dueRecurring(rules, today, now);
  if (due.length === 0) return 0;
  let created = 0;
  for (const item of due) {
    try {
      await createExpense(item.expenseId, item.expense);
      created++;
    } catch (error) {
      if (!(error instanceof ExpenseIdExistsError)) throw error;
    }
  }
  // Đọc lại thiết lập mới nhất trước khi ghi `done` để không đè thay đổi người dùng vừa lưu.
  const latest = await loadSettings();
  await saveSettings({ ...latest, recurring: markDone(latest.recurring ?? [], due) });
  return created;
}
