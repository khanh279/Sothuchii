import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useColors } from '@/hooks/use-colors';
import { formatGrouped } from '@/utils/format';

/**
 * Số dư của MỘT quỹ ở thẻ quỹ (danh sách Quỹ nhóm; ô chọn quỹ ở trang Thu quỹ / Chi quỹ chỉ hiện số, `hideLabel`): dòng nhãn "Số dư / Số dư thực tế", dòng dưới là hai số cách nhau dấu "/", đơn vị ở cuối.
 * Số dư = tiền đang có trong quỹ (màu số mặc định); số dư thực tế = đã trừ nợ cá nhân (xanh lá khi dương, đỏ khi âm, mặc định khi bằng 0).
 */
export function FundBalanceText({ cash, owed, hideLabel }: { cash: number; owed: number; hideLabel?: boolean }) {
  const colors = useColors();
  const real = cash - owed;
  return (
    <View style={styles.col}>
      {!hideLabel && (
        <AppText color={colors.muted} style={styles.label} numberOfLines={1}>
          Số dư / Số dư thực tế
        </AppText>
      )}
      <AppText color={colors.ink} style={styles.value} numberOfLines={1}>
        {formatGrouped(cash)}
        {' / '}
        <AppText color={real < 0 ? colors.danger : real > 0 ? colors.success : colors.ink} style={styles.value}>
          {formatGrouped(real)}
        </AppText>
        {' ₫'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: 11, lineHeight: 18 },
  value: { fontSize: 12, lineHeight: 18 },
});
