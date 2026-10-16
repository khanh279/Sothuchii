import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FundListScreen from '@/features/funds/FundListScreen';
import { useColors } from '@/hooks/use-colors';

/** Tab "Quỹ nhóm": khung trang cho `FundListScreen` (tiêu đề, nút "+ Giao dịch quỹ" và danh sách quỹ). */
export default function FundsTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.body, { paddingBottom: 92 + insets.bottom }]}>
        <FundListScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 }, body: { flex: 1 } });
