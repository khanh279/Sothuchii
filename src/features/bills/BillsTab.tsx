import { useMemo } from 'react';

import { initialPeriodView, periodOf } from '@/domain/expenses';
import BillHistoryScreen from '@/features/bills/BillHistoryScreen';
import { PeriodBar } from '@/features/expenses/PeriodBar';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { todayStr } from '@/utils/date';

/**
 * Tab "Chia bill": danh sách bill (dùng lại `BillHistoryScreen`) với bộ chọn kỳ RIÊNG của tab, được nhớ khi đổi tab. Tạo bill mới đi qua nút + ở Tổng quan.
 */
export default function BillsTab() {
  const today = todayStr();
  const [view, setView] = usePersistedState('tab:chia-bill:view', () => initialPeriodView(today));
  const period = useMemo(() => periodOf(view), [view]);
  return (
    <BillHistoryScreen
      tab={{
        period,
        header: <PeriodBar title="Chia bill" view={view} onChange={setView} today={today} />,
      }}
    />
  );
}
