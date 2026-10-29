import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { useColors } from '@/hooks/use-colors';

/**
 * "Người trả → người nhận" của một khoản chuyển: tên hai người nối bằng mũi tên vẽ (không dùng ký tự "→" vì mỗi máy vẽ một kiểu).
 * Khoản đã thanh toán xong (`done`) thì mờ và gạch ngang tên. Tên dài tự xuống dòng.
 */
export function TransferNames({ from, to, done = false, style }: { from: string; to: string; done?: boolean; style?: StyleProp<TextStyle> }) {
  const colors = useColors();
  const nameStyle = [style, done && { textDecorationLine: 'line-through' as const }];
  return (
    <View style={styles.row} accessible accessibilityLabel={`${from} trả ${to}`}>
      <AppText weight="semibold" color={done ? colors.muted : undefined} style={[nameStyle, styles.name]} numberOfLines={2}>
        {from}
      </AppText>
      <SvgIcon name="arrowRight" size={15} color={colors.muted} strokeWidth={2.2} />
      <AppText weight="semibold" color={done ? colors.muted : undefined} style={[nameStyle, styles.name]} numberOfLines={2}>
        {to}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, flex: 1, minWidth: 0 },
  name: { flexShrink: 1 },
});
