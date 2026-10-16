import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { PeriodFilter } from '@/components/period-filter';
import { SvgIcon } from '@/components/svg-icon';
import { type PeriodView } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';
import type { DateStr } from '@/types/expense';

interface Props {
  /** Tiêu đề màn hình hiện phía trên bộ chọn (ví dụ "Tổng quan"). */
  title?: string;
  /** Có giá trị thì hiện biểu tượng bánh răng ở góc phải tiêu đề (mở Cài đặt). */
  onSettings?: () => void;
  view: PeriodView;
  onChange: (view: PeriodView) => void;
  today: DateStr;
}

/**
 * Đầu trang của các tab có lọc theo kỳ (Tổng quan, Chi tiêu, Chia bill): tiêu đề (và bánh răng nếu có) và bộ lọc thời gian dùng chung
 * `PeriodFilter` (một dòng thu gọn, bấm để mở bảng chọn). Nền trang xám nhạt, được đặt làm phần tử dính ở đầu trang cuộn.
 */
export function PeriodBar({ title, onSettings, view, onChange, today }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg, paddingTop: 8 + insets.top }]}>
      {!!title && (
        <View style={styles.titleRow}>
          <AppText weight="display" style={styles.title} accessibilityRole="header">
            {title}
          </AppText>
          {onSettings && (
            <Pressable accessibilityRole="button" accessibilityLabel="Cài đặt" hitSlop={6} onPress={onSettings} style={[styles.gear, { backgroundColor: colors.surface }]}>
              <SvgIcon name="gear" size={20} color={colors.primary} strokeWidth={1.9} />
            </Pressable>
          )}
        </View>
      )}
      <PeriodFilter view={view} onChange={onChange} today={today} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  gear: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
