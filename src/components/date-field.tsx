import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';
import type { DateStr } from '@/types/expense';
import { dateFromStr, formatDateStr, formatVnDate, isValidDateStr } from '@/utils/date';

interface Props {
  value: DateStr;
  onChange: (value: DateStr) => void;
  /** Ngày muộn nhất được chọn (thường là hôm nay). */
  max: DateStr;
  invalid?: boolean;
  /** Dạng viên thuốc có biểu tượng lịch (ô chọn khoảng ngày ở Tổng quan). Mặc định là ô nhập thường. */
  pill?: boolean;
}

/**
 * Ô chọn ngày dùng bộ chọn gốc của hệ điều hành (iOS: gọn trong ô; Android: hộp thoại).
 * Sẽ được thay bằng lịch tự dựng giống PWA ở bước làm form nhập (P4).
 */
export function DateField({ value, onChange, max, invalid, pill }: Props) {
  const colors = useColors();
  const current = dateFromStr(isValidDateStr(value) ? value : max);
  const latest = dateFromStr(max);
  const box = pill
    ? [styles.pillBox, { backgroundColor: colors.surface, borderColor: colors.line }]
    : [styles.box, { backgroundColor: colors.bg, borderColor: colors.line }];
  const border = invalid ? { borderColor: colors.danger } : null;

  if (Platform.OS === 'ios') {
    return (
      <View style={[...box, border, styles.iosBox]}>
        <DateTimePicker
          mode="date"
          display="compact"
          value={current}
          maximumDate={latest}
          onValueChange={(_event, date) => onChange(formatDateStr(date))}
          accessibilityLabel="Ngày"
        />
        {pill && (
          <View pointerEvents="none" style={styles.icon}>
            <SvgIcon name="calendar" size={20} color={colors.muted} />
          </View>
        )}
      </View>
    );
  }

  return (
    <Pressable
      style={[...box, border, styles.row]}
      accessibilityRole="button"
      accessibilityLabel="Chọn ngày"
      onPress={() =>
        DateTimePickerAndroid.open({
          value: current,
          mode: 'date',
          maximumDate: latest,
          onValueChange: (_event, date) => onChange(formatDateStr(date)),
        })
      }>
      <AppText style={pill ? styles.pillText : styles.text}>{isValidDateStr(value) ? formatVnDate(value) : 'dd/mm/yyyy'}</AppText>
      {pill && <SvgIcon name="calendar" size={20} color={colors.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 46, borderRadius: AppRadius.field, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 14 },
  pillBox: { height: 42, borderRadius: AppRadius.pill, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 14 },
  iosBox: { alignItems: 'flex-start', paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  text: { fontSize: 16 },
  pillText: { fontSize: 15 },
});
