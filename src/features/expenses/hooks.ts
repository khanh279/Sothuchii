import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadSettings, saveSettings } from '@/data/expenseRepository';
import { StorageCorruptError } from '@/data/storage';
import { EMPTY_SETTINGS } from '@/domain/expenses';
import type { ExpenseSettings } from '@/types/expense';

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
