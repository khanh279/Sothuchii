import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

interface Props {
  label: string;
  onPress: () => void;
  /** `card` (mặc định): thẻ riêng nền trắng giữa các thẻ của trang. `inner`: ô nhỏ nền trang đặt BÊN TRONG một thẻ trắng. */
  variant?: 'card' | 'inner';
}

/** Nút dạng ô có mũi tên ở cuối, dẫn sang trang chi tiết (ví dụ từ tab Chi tiêu / Nợ & bill sang trang Tất cả giao dịch hoặc Danh sách bill). */
export function DetailLink({ label, onPress, variant = 'card' }: Props) {
  const colors = useColors();
  const inner = variant === 'inner';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.link, inner ? styles.inner : styles.card, { backgroundColor: inner ? colors.bg : colors.surface, opacity: pressed ? 0.8 : 1 }]}>
      <AppText weight="semibold" style={styles.label} numberOfLines={1}>
        {label}
      </AppText>
      <SvgIcon name="chevronRight" size={20} color={colors.muted} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  card: { minHeight: 56, borderRadius: AppRadius.card },
  inner: { minHeight: 48, borderRadius: AppRadius.field },
  label: { flex: 1, fontSize: 15, lineHeight: 21 },
});
