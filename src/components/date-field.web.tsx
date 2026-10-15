import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { PwaColors } from '@/constants/theme';
import type { DateStr } from '@/types/expense';
import { formatVnDate, isValidDateStr, maskVnDateInput, parseVnDate } from '@/utils/date';

interface Props {
  /** Chỉ dùng làm giá trị ban đầu; sau đó ô tự giữ chữ đang gõ. */
  value: DateStr;
  /** Trả về '' khi chữ đang gõ chưa thành ngày hợp lệ. */
  onChange: (value: DateStr) => void;
  max: DateStr;
  invalid?: boolean;
}

/** Bản web: bộ chọn gốc chưa có nên nhập tay dd/mm/yyyy (giống PWA khi gõ ngày). */
export function DateField({ value, onChange, invalid }: Props) {
  const [text, setText] = useState(isValidDateStr(value) ? formatVnDate(value) : '');
  return (
    <TextInput
      style={[styles.input, invalid && styles.invalid]}
      value={text}
      onChangeText={(next) => {
        const masked = maskVnDateInput(next);
        setText(masked);
        onChange(parseVnDate(masked));
      }}
      placeholder="dd/mm/yyyy"
      placeholderTextColor={PwaColors.muted}
      keyboardType="number-pad"
      maxLength={10}
      accessibilityLabel="Ngày"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PwaColors.line,
    backgroundColor: PwaColors.bg,
    paddingHorizontal: 14,
    fontSize: 16,
    color: PwaColors.ink,
  },
  invalid: { borderColor: PwaColors.danger },
});
