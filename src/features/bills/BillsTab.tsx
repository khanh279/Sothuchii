import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTitle, TitleAction } from '@/components/design';
import BillHistoryScreen from '@/features/bills/BillHistoryScreen';
import { useSharedPeriod } from '@/hooks/use-shared-period';

/**
 * Tab "Chia bill": danh sách bill (dùng lại `BillHistoryScreen`) lọc theo kỳ DÙNG CHUNG chọn ở Tổng quan (không có ô chọn ngày riêng).
 * Nút "+ Tạo bill" ở hàng tiêu đề của tab này mở biểu mẫu tạo bill hiện có; lưu xong quay lại đúng danh sách.
 */
export default function BillsTab() {
  const insets = useSafeAreaInsets();
  const { period } = useSharedPeriod();
  return (
    <BillHistoryScreen
      tab={{
        period,
        header: <ScreenTitle title="Chia bill" topInset={insets.top} right={<TitleAction label="Tạo bill" onPress={() => router.push('/chia-bill/tao')} />} />,
      }}
    />
  );
}
