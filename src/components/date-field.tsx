import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { PwaColors } from '@/constants/theme';
import type { DateStr } from '@/types/expense';
import { dateFromStr, formatDateStr, formatVnDate, isValidDateStr } from '@/utils/date';

interface Props {
  value: DateStr;
  onChange: (value: DateStr) => void;
  /** Ngày muộn nhất được chọn (thường là hôm nay). */
  max: DateStr;
  invalid?: boolean;
}

/** Ô chọn ngày: bộ chọn gốc của hệ điều hành (iOS: gọn trong ô; Android: hộp thoại). */
export function DateField({ value, onChange, max, invalid }: Props) {
  const current = dateFromStr(isValidDateStr(value) ? value : max);
  const latest = dateFromStr(max);

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.box, invalid && styles.invalid]}>
        <DateTimePicker
          mode="date"
          display="compact"
          value={current}
          maximumDate={latest}
          onValueChange={(_event, date) => onChange(formatDateStr(date))}
          accessibilityLabel="Ngày"
        />
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.box, styles.pressable, invalid && styles.invalid]}
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
      <Text style={styles.text}>{isValidDateStr(value) ? formatVnDate(value) : 'dd/mm/yyyy'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PwaColors.line,
    backgroundColor: PwaColors.bg,
    justifyContent: 'center',
    paddingHorizontal: 10,
    alignItems: 'flex-start',
  },
  pressable: { paddingHorizontal: 14 },
  invalid: { borderColor: PwaColors.danger },
  text: { fontSize: 16, color: PwaColors.ink },
});
