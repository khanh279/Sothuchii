import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppFonts } from '@/constants/fonts';
import { parseAmountInput } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';
import { formatGrouped } from '@/utils/format';

interface Props {
  /** Số tiền (đồng). 0 = để trống. */
  value: number;
  onChangeValue: (value: number) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}

/**
 * Ô nhập số tiền lớn của PWA (`.amount`): chữ Bricolage 38/700, viền dưới xanh 1.6px,
 * "₫" 22/700 màu phụ; tự thêm dấu chấm hàng nghìn khi gõ.
 */
export function AmountInput({ value, onChangeValue, invalid, autoFocus }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.row, { borderBottomColor: invalid ? colors.danger : colors.primary }]}>
      <TextInput
        style={[styles.input, { color: colors.ink, fontFamily: AppFonts.display }]}
        value={value ? formatGrouped(value) : ''}
        onChangeText={(text) => onChangeValue(parseAmountInput(text))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.line}
        autoFocus={autoFocus}
        accessibilityLabel="Số tiền"
      />
      <AppText weight="display" color={colors.muted} style={styles.suffix}>
        ₫
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8, borderBottomWidth: 1.6, paddingBottom: 6 },
  input: { flex: 1, minWidth: 0, height: 55, padding: 0, fontSize: 38, letterSpacing: -0.76 },
  suffix: { fontSize: 22 },
});
