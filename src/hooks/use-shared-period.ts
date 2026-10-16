import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { initialPeriodView, periodOf, type PeriodView } from '@/domain/expenses';
import type { Period } from '@/types/expense';
import { todayStr } from '@/utils/date';

/**
 * Kỳ xem DÙNG CHUNG của các tab Tổng quan, Chi tiêu, Chia bill và mục Giao dịch của Công nợ: chọn ở Tổng quan, các tab còn lại chỉ đọc.
 * Một giá trị duy nhất trong bộ nhớ phiên chạy (không lưu xuống máy, không phải dữ liệu nghiệp vụ), có đăng ký lắng nghe để mọi tab đang
 * mở cập nhật cùng lúc khi kỳ đổi. Mặc định là tháng hiện tại (`initialPeriodView`).
 */
let current: PeriodView | null = null;
const listeners = new Set<() => void>();

const read = (): PeriodView => (current ??= initialPeriodView(todayStr()));

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSharedPeriod(): { view: PeriodView; setView: (view: PeriodView) => void; period: Period } {
  const view = useSyncExternalStore(subscribe, read, read);
  const setView = useCallback((next: PeriodView) => {
    current = next;
    listeners.forEach((listener) => listener());
  }, []);
  const period = useMemo(() => periodOf(view), [view]);
  return { view, setView, period };
}
