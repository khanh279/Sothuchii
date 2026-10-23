import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadBills } from '@/data/billRepository';
import { syncBillExpenses } from '@/data/billSync';
import { loadPays } from '@/data/payRepository';
import { loadPeople } from '@/data/peopleRepository';
import { StorageCorruptError, StorageKeys } from '@/data/storage';
import { useReloadOnWrite } from '@/hooks/use-reload-on-write';
import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

/** Thông báo dễ hiểu cho lỗi đọc/ghi dữ liệu Công nợ. */
export function describeDebtError(error: unknown): string {
  if (error instanceof StorageCorruptError) {
    return 'Dữ liệu Công nợ trên máy bị hỏng nên chưa thể mở. App không ghi đè lên dữ liệu này.';
  }
  return 'Không đọc hoặc ghi được dữ liệu. Hãy thử lại.';
}

interface State {
  bills: Bill[];
  pays: Pay[];
  people: string[];
  loaded: boolean;
  error: string | null;
}

/**
 * Bill, khoản trả và Danh sách người; mỗi lần màn hình được mở lại sẽ đồng bộ chi tiêu cá nhân (như PWA khi khởi động)
 * rồi đọc lại. Lỗi đồng bộ không chặn việc hiển thị; lỗi đọc dữ liệu thì báo lên màn hình.
 */
export function useDebtData() {
  const [state, setState] = useState<State>({ bills: [], pays: [], people: [], loaded: false, error: null });

  const reload = useCallback(async () => {
    try {
      const [bills, pays, people] = await Promise.all([loadBills(), loadPays(), loadPeople().catch(() => [] as string[])]);
      setState({ bills, pays, people, loaded: true, error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, loaded: true, error: describeDebtError(error) }));
    }
  }, []);

  // Có ai ghi bill / khoản trả / danh sách người (kể cả từ màn hình khác) thì tải lại ngay, không đợi quay lại màn hình này.
  useReloadOnWrite([StorageKeys.bills, StorageKeys.pays, StorageKeys.people], reload);

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
