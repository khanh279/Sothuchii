import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTitle } from '@/components/design';
import FundListScreen from '@/features/funds/FundListScreen';
import { useColors } from '@/hooks/use-colors';

/** Tab "Quỹ nhóm": danh sách quỹ, đóng quỹ, chi quỹ và lịch sử (dùng lại `FundListScreen`), chỉ thêm tiêu đề trang. */
export default function FundsTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScreenTitle title="Quỹ nhóm" topInset={insets.top} />
      <View style={[styles.body, { paddingBottom: 92 + insets.bottom }]}>
        <FundListScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 }, body: { flex: 1 } });
