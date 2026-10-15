import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

/**
 * Tab Giao dịch (đóng quỹ, chia bill, chuyển tiền). Nghiệp vụ chưa được chuyển sang mobile
 * nên chỉ hiện thông báo; sẽ thay bằng nội dung thật khi làm module Quỹ / Chia bill / Nợ.
 */
export default function TransactionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 8 + insets.top, paddingBottom: 92 + insets.bottom }]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <AppText weight="display" style={styles.title}>
          Đang phát triển
        </AppText>
        <AppText color={colors.muted} style={styles.text}>
          Đóng quỹ, chia bill và chuyển tiền chưa có trên bản mobile. Các chức năng này sẽ được bổ sung ở giai đoạn sau.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 12, justifyContent: 'center' },
  card: { borderRadius: AppRadius.card, borderWidth: 1, padding: 20, gap: 8 },
  title: { fontSize: 18 },
  text: { fontSize: 14, lineHeight: 20 },
});
