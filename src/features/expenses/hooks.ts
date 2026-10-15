import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { listMonthKeys, loadMonths, loadSettings, saveSettings } from '@/data/expenseRepository';
import { StorageCorruptError } from '@/data/storage';
import { EMPTY_SETTINGS, filterByPeriod, monthsInPeriod } from '@/domain/expenses';
import type { ExpenseSettings, ExpenseWithId, MonthKey, Period } from '@/types/expense';
import { todayStr } from '@/utils/date';

/** Thông báo dễ hiểu cho lỗi đọc/ghi dữ liệu. */
export function describeStorageError(error: unknown): string {
  if (error instanceof StorageCorruptError) {
    return 'Dữ liệu chi tiêu trên máy bị hỏng nên chưa thể mở. App không ghi đè lên dữ liệu này.';
  }
  return 'Không đọc hoặc ghi được dữ liệu. Hãy thử lại.';
}

interface SettingsState {
  settings: ExpenseSettings;
  loaded: boolean;
  error: string | null;
}

/** Cài đặt chi tiêu (ngân sách, mục riêng); tự đọc lại mỗi khi màn hình được mở lại. */
export function useExpenseSettings() {
  const [state, setState] = useState<SettingsState>({ settings: EMPTY_SETTINGS, loaded: false, error: null });

  const reload = useCallback(async () => {
    try {
      const settings = await loadSettings();
      setState({ settings, loaded: true, error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, loaded: true, error: describeStorageError(error) }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  /** Lưu rồi cập nhật state; ném lỗi nếu ghi thất bại để màn hình báo cho người dùng. */
  const save = useCallback(async (next: ExpenseSettings) => {
    await saveSettings(next);
    setState({ settings: next, loaded: true, error: null });
  }, []);

  return { ...state, reload, save };
}

interface ExpensesState {
  items: ExpenseWithId[];
  /** Các tháng đã đọc (dùng để vẽ trục thời gian). */
  months: MonthKey[];
  loaded: boolean;
  error: string | null;
}

/**
 * Các khoản chi trong một kỳ; tự đọc lại mỗi khi màn hình được mở lại.
 * `period` phải ổn định giữa các lần render (giữ trong state hoặc useMemo), nếu không sẽ đọc lại liên tục.
 */
export function useExpenses(period: Period) {
  const [state, setState] = useState<ExpensesState>({ items: [], months: [], loaded: false, error: null });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    try {
      const known = period.mode === 'all' ? await listMonthKeys() : [];
      const months = monthsInPeriod(period, known, todayStr());
      const items = filterByPeriod(await loadMonths(months), period);
      if (request === latest.current) setState({ items, months, loaded: true, error: null });
    } catch (error) {
      if (request === latest.current) setState((prev) => ({ ...prev, loaded: true, error: describeStorageError(error) }));
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { ...state, reload };
}
