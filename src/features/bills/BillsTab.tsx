import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { PrimaryButton } from '@/components/design';
import { initialPeriodView, periodOf } from '@/domain/expenses';
import BillHistoryScreen from '@/features/bills/BillHistoryScreen';
import { PeriodBar } from '@/features/expenses/PeriodBar';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { todayStr } from '@/utils/date';

/**
 * Tab "Chia bill": danh sách bill (dùng lại `BillHistoryScreen`) với bộ chọn kỳ RIÊNG của tab, được nhớ khi đổi tab. Nút "Tạo bill"
 * mở màn tạo bill riêng; lưu xong quay lại đúng danh sách và kỳ đang xem.
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
        top: (
          <View style={{ marginBottom: 12 }}>
            <PrimaryButton label="Tạo bill" onPress={() => router.push('/chia-bill/tao')} />
          </View>
        ),
      }}
    />
  );
}
