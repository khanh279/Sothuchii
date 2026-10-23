import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadBills } from '@/data/billRepository';
import { syncBillExpenses } from '@/data/billSync';
import { StorageCorruptError, StorageKeys } from '@/data/storage';
import { useReloadOnWrite } from '@/hooks/use-reload-on-write';
import type { Bill } from '@/types/bill';

/** Thông báo dễ hiểu cho lỗi đọc/ghi dữ liệu Chia bill. */
export function describeBillError(error: unknown): string {
  if (error instanceof StorageCorruptError) {
    return 'Dữ liệu Chia bill trên máy bị hỏng nên chưa thể mở. App không ghi đè lên dữ liệu này.';
  }
  return 'Không đọc hoặc ghi được dữ liệu. Hãy thử lại.';
}

/**
 * Danh sách bill; mỗi lần màn hình được mở lại sẽ đồng bộ chi tiêu cá nhân (như PWA khi khởi động) rồi đọc lại.
 * Lỗi đồng bộ không chặn việc hiển thị; lỗi đọc dữ liệu thì báo lên màn hình.
 */
export function useBills() {
  const [state, setState] = useState<{ bills: Bill[]; loaded: boolean; error: string | null }>({ bills: [], loaded: false, error: null });

  const reload = useCallback(async () => {
    try {
      setState({ bills: await loadBills(), loaded: true, error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, loaded: true, error: describeBillError(error) }));
    }
  }, []);

  // Có ai ghi bill (kể cả từ màn hình khác) thì tải lại ngay, không đợi quay lại màn hình này.
  useReloadOnWrite([StorageKeys.bills], reload);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          await syncBillExpenses();
        } catch {
          // Đồng bộ sẽ thử lại lần sau; phần đọc bên dưới tự báo nếu dữ liệu hỏng.
        }
        await reload();
      })();
    }, [reload]),
  );

  return { ...state, reload };
}
