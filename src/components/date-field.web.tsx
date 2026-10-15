import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { SvgIcon } from '@/components/svg-icon';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';
import type { DateStr } from '@/types/expense';
import { formatVnDate, isValidDateStr, maskVnDateInput, parseVnDate } from '@/utils/date';

interface Props {
  /** Chỉ dùng làm giá trị ban đầu; sau đó ô tự giữ chữ đang gõ. */
  value: DateStr;
  /** Trả về '' khi chữ đang gõ chưa thành ngày hợp lệ. */
  onChange: (value: DateStr) => void;
  max: DateStr;
  invalid?: boolean;
  pill?: boolean;
}

/** Bản web: bộ chọn gốc chưa có nên nhập tay dd/mm/yyyy (giống PWA khi gõ ngày). */
export function DateField({ value, onChange, invalid, pill }: Props) {
  const colors = useColors();
  const [text, setText] = useState(isValidDateStr(value) ? formatVnDate(value) : '');
  return (
    <View>
      <TextInput
        style={[
          pill ? styles.pill : styles.input,
          { backgroundColor: pill ? colors.surface : colors.bg, borderColor: invalid ? colors.danger : colors.line, color: colors.ink, fontFamily: AppFonts.regular },
        ]}
        value={text}
        onChangeText={(next) => {
          const masked = maskVnDateInput(next);
          setText(masked);
          onChange(parseVnDate(masked));
        }}
        placeholder="dd/mm/yyyy"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        maxLength={10}
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

const styles = StyleSheet.create({
  input: { minHeight: 46, borderRadius: AppRadius.field, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  pill: { height: 42, borderRadius: AppRadius.pill, borderWidth: 1, paddingLeft: 14, paddingRight: 40, fontSize: 15 },
  icon: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
});
