
import type { Vnd } from '@/types/money';

export interface ReminderItem {
  title: string;
  /** Ngày của khoản (YYYY-MM-DD). */
  date: string;
  amount: Vnd;
}