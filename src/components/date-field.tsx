import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';
import type { DateStr } from '@/types/expense';
import { formatVnDate, isValidDateStr } from '@/utils/date';

interface Props {
  value: DateStr;
  /** Bấm vào ô thì mở lịch (`CalendarPanel`); ô chỉ hiển thị, không gõ tay — như PWA. */
  onPress: () => void;
  invalid?: boolean;
  /** Dạng viên thuốc cao 42 (ô chọn khoảng ngày ở Tổng quan). Mặc định là ô nhập cao 46 của form. */
  pill?: boolean;
  accessibilityLabel?: string;
}

/** Ô ngày `dd/mm/yyyy` kèm biểu tượng lịch ở bên phải (`.datebox` của PWA). */
export function DateField({ value, onPress, invalid, pill, accessibilityLabel = 'Ngày' }: Props) {
  const colors = useColors();
  const valid = isValidDateStr(value);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${valid ? formatVnDate(value) : 'chưa chọn'}`}
      style={[
        pill ? styles.pill : styles.field,
        {
          backgroundColor: pill ? colors.surface : colors.bg,
          borderColor: invalid ? colors.danger : colors.line,
        },
      ]}>
      <AppText color={valid ? colors.ink : colors.muted} style={pill ? styles.pillText : styles.text}>
        {valid ? formatVnDate(value) : 'dd/mm/yyyy'}
      </AppText>
      <View pointerEvents="none" style={[styles.icon, { width: pill ? 40 : 32 }]}>
        <SvgIcon name="calendar" size={20} color={colors.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { height: 46, borderRadius: AppRadius.field, borderWidth: 1, paddingLeft: 10, paddingRight: 32, justifyContent: 'center' },
  pill: { height: 42, borderRadius: AppRadius.pill, borderWidth: 1, paddingLeft: 14, paddingRight: 40, justifyContent: 'center' },
  text: { fontSize: 16 },
  pillText: { fontSize: 15 },
  icon: { position: 'absolute', right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
