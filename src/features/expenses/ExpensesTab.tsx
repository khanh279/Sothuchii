import { useMemo } from 'react';

import { initialPeriodView, periodOf } from '@/domain/expenses';
import HistoryScreen from '@/features/expenses/HistoryScreen';
import { PeriodBar } from '@/features/expenses/PeriodBar';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { todayStr } from '@/utils/date';

/**
 * Tab "Chi tiêu": danh sách chi tiêu cá nhân (dùng lại `HistoryScreen`) với bộ chọn kỳ và chip lọc RIÊNG của tab này,
 * được nhớ khi chuyển sang tab khác rồi quay lại. Không dùng chung kỳ với Tổng quan.
 */
export default function ExpensesTab() {
  const today = todayStr();
  const [view, setView] = usePersistedState('tab:chi-tieu:view', () => initialPeriodView(today));
  const [chip, setChip] = usePersistedState<string>('tab:chi-tieu:chip', () => 'all');
  const period = useMemo(() => periodOf(view), [view]);
  return <HistoryScreen tab={{ period, chip, onChip: setChip, header: <PeriodBar title="Chi tiêu" view={view} onChange={setView} today={today} /> }} />;
}
