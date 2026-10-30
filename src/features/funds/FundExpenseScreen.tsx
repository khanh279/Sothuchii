import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ScreenTitle } from '@/components/design';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { FundExpensePanel } from '@/features/funds/FundExpensePanel';
import { useFundData } from '@/features/funds/hooks';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';
import { router } from '@/utils/safe-router';

/** Quay lại màn trước; nếu không có màn trước (mở thẳng trang này) thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Trang riêng của form Chi tiêu quỹ (`mode="chi"`) và Thu quỹ (`mode="thu"`): mở sau khi chọn quỹ ở thẻ nổi (tham số route `fund` = mã quỹ đã chọn, form hiện ngay)
 * từ nút "+" ở Tổng quan hoặc mục Giao dịch quỹ ở tab Quỹ nhóm; không có `fund` thì hiện danh sách quỹ để chọn trước. Lưu xong quay lại. Chỉ dùng được khi đã có quỹ.
 */
export default function FundExpenseScreen({ mode = 'chi' }: { mode?: 'chi' | 'thu' } = {}) {
  const heading = mode === 'thu' ? 'Thu quỹ' : 'Chi tiêu quỹ';
  const { fund } = useLocalSearchParams<{ fund?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, loaded, error, reload } = useFundData();

  let body;
  if (error) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          {error}
        </AppText>
      </View>
    );
  } else if (!loaded) {
    body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  } else if (data.funds.length === 0) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.surface }]}>
        <AppText color={colors.muted} style={styles.noticeText}>
          {mode === 'thu' ? 'Chưa có quỹ nào. Hãy tạo quỹ mới trước khi ghi khoản thu.' : 'Chưa có quỹ nào. Hãy tạo quỹ ở tab Quỹ nhóm trước khi ghi chi tiêu quỹ.'}
        </AppText>
      </View>
    );
  } else {
    body = (
      <KeyboardAwareScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {mode === 'thu' ? (
          // Thu quỹ tự có hai thẻ riêng (như trang tạo bill), nên không bọc thêm thẻ ngoài.
          <FundExpensePanel data={data} mode={mode} initialFundId={fund} onChanged={leave} onAdded={() => void reload()} />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <FundExpensePanel data={data} mode={mode} initialFundId={fund} onChanged={leave} onAdded={() => void reload()} />
          </View>
        )}
      </KeyboardAwareScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: heading, headerShown: false }} />
      <ScreenTitle title={heading} topInset={insets.top} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 4 },
  card: { borderRadius: AppRadius.card, padding: 16 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, marginTop: 8, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
});
