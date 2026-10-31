import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useColors } from '@/hooks/use-colors';
import { formatGrouped } from '@/utils/format';

/**
 * Số còn lại thực tế của MỘT quỹ ở thẻ quỹ (danh sách Quỹ nhóm; ô chọn quỹ ở trang Thu quỹ / Chi quỹ chỉ hiện số, `hideLabel`): dòng nhãn "Số dư" và một số duy nhất, đơn vị ở cuối
 * (xanh lá khi dương, đỏ khi âm, mặc định khi bằng 0).
 */
export function FundBalanceText({ balance, hideLabel }: { balance: number; hideLabel?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.col}>
      {!hideLabel && (
        <AppText color={colors.muted} style={styles.label} numberOfLines={1}>
          Số dư
        </AppText>
      )}
      <AppText color={balance < 0 ? colors.danger : balance > 0 ? colors.success : colors.ink} style={styles.value} numberOfLines={1}>
        {formatGrouped(balance)} ₫
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: 11, lineHeight: 18 },
  value: { fontSize: 12, lineHeight: 18 },
});
