import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTitle } from '@/components/design';
import { PeriodFilter } from '@/components/period-filter';
import { PageLayout } from '@/constants/layout';
import { type PeriodView } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';
import type { DateStr } from '@/types/expense';

interface Props {
  /** Tiêu đề màn hình hiện phía trên bộ chọn (ví dụ "Tổng quan"). */
  title?: string;
  view: PeriodView;
  onChange: (view: PeriodView) => void;
  today: DateStr;
}

/**
 * Đầu trang của các tab có lọc theo kỳ: tiêu đề bên trái và, cùng hàng, bên phải là ô chọn thời gian dùng chung `PeriodFilter` dạng gọn
 * (bấm để mở bảng chọn), cùng vị trí ở mọi tab. Không có tiêu đề thì ô chọn nằm một dòng riêng. Nền trang xám nhạt, được đặt làm phần tử dính ở đầu trang cuộn.
 */
export function PeriodBar({ title, view, onChange, today }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ backgroundColor: colors.bg }}>
      {!!title && <ScreenTitle title={title} topInset={insets.top} right={<PeriodFilter compact view={view} onChange={onChange} today={today} />} />}
      {!title && (
        <View style={styles.filter}>
          <PeriodFilter view={view} onChange={onChange} today={today} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filter: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, paddingBottom: 10 },
});
