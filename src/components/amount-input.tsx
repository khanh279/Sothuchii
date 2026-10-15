import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PwaColors } from '@/constants/theme';
import { parseAmountInput } from '@/domain/expenses';
import { formatGrouped } from '@/utils/format';

interface Props {
  /** Số tiền (đồng). 0 = để trống. */
  value: number;
  onChangeValue: (value: number) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}

/** Ô nhập số tiền lớn, tự thêm dấu chấm hàng nghìn khi gõ. */
export function AmountInput({ value, onChangeValue, invalid, autoFocus }: Props) {
  return (
    <View style={[styles.row, invalid && styles.rowInvalid]}>
      <TextInput
        style={styles.input}
        value={value ? formatGrouped(value) : ''}
        onChangeText={(text) => onChangeValue(parseAmountInput(text))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={PwaColors.line}
        autoFocus={autoFocus}
        accessibilityLabel="Số tiền"
      />
      <Text style={styles.suffix}>₫</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: PwaColors.primary,
    paddingBottom: 6,
  },
  rowInvalid: { borderBottomColor: PwaColors.danger },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: 38,
    fontWeight: '700',
    color: PwaColors.ink,
  },
  suffix: { fontSize: 22, fontWeight: '700', color: PwaColors.muted },
});
