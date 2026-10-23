import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadFundData } from '@/data/fundRepository';
import { syncFundExpenses } from '@/data/fundSync';
import { StorageCorruptError, StorageKeys } from '@/data/storage';
import { useReloadOnWrite } from '@/hooks/use-reload-on-write';
import type { FundData } from '@/types/fund';

const EMPTY: FundData = { funds: [], contribs: [], expenses: [], cur: '' };

/** Thông báo dễ hiểu cho lỗi đọc/ghi dữ liệu Quỹ. */
export function describeFundError(error: unknown): string {
  if (error instanceof StorageCorruptError) {
    return 'Dữ liệu Quỹ nhóm trên máy bị hỏng nên chưa thể mở. App không ghi đè lên dữ liệu này.';
  }
  return 'Không đọc hoặc ghi được dữ liệu. Hãy thử lại.';
}

interface State {
  data: FundData;
  loaded: boolean;
  error: string | null;
}

/**
 * Dữ liệu Quỹ; mỗi lần màn hình được mở lại sẽ đồng bộ phần chi tiêu cá nhân (như PWA khi khởi động)
 * rồi đọc lại. Lỗi đồng bộ không chặn việc hiển thị; lỗi đọc dữ liệu thì báo lên màn hình.
 */
export function useFundData() {
  const [state, setState] = useState<State>({ data: EMPTY, loaded: false, error: null });

  const reload = useCallback(async () => {
    try {
      const data = await loadFundData();
      setState({ data, loaded: true, error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, loaded: true, error: describeFundError(error) }));
    }
  }, []);

  // Có ai ghi dữ liệu quỹ (kể cả từ màn hình khác) thì tải lại ngay, không đợi quay lại màn hình này.
  useReloadOnWrite([StorageKeys.fund], reload);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          await syncFundExpenses();
        } catch {
          // Đồng bộ sẽ thử lại lần sau; phần đọc bên dưới tự báo nếu dữ liệu hỏng.
        }
        await reload();
      })();
    }, [reload]),
  );

  return { ...state, reload };
}
