import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ScreenTitle } from '@/components/design';
import { advanceSummary } from '@/domain/fundAdvance';
import { FundActionSheet, type FundActionTarget } from '@/features/funds/FundActionSheet';
import { useFundData } from '@/features/funds/hooks';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

/** Quay lại màn trước; mở thẳng trang này thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * TRANG "Chi từ A ứng" (`mode` = expense, theo người `person` và phạm vi quỹ `fund`: các lần giao ứng gộp chung, chi vào lần cũ nhất trước) và "A hoàn tiền ứng" (`mode` = refund) cho một hồ sơ ứng trước (`id`): mở từ trang "A nợ quỹ". Hiện như các trang khác
 * (tiêu đề ở đầu trang, không nút X, vuốt cạnh trái để quay lại), dùng lại `FundActionSheet` ở chế độ trang. Lưu xong quay lại.
 */
export default function FundAdvanceActionScreen() {
  const { mode = '', id = '', person = '', fund = 'all' } = useLocalSearchParams<{ mode?: string; id?: string; person?: string; fund?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, loaded, error } = useFundData();

  const advance = data.advances?.find((item) => item.id === id);
  let target: FundActionTarget | null = null;
  if (mode === 'expense' && person) target = { mode: 'expense', person, fundId: fund };
  else if (mode === 'refund' && person) {
    const who = person.trim();
    const max = (data.advances ?? [])
      .filter((item) => (fund === 'all' || item.fundId === fund) && item.person.trim() === who)
      .reduce((total, item) => total + advanceSummary(data, item).held, 0);
    target = { mode: 'refund', person: who, fundId: fund, max };
  } else if (advance && mode === 'refund') target = { mode: 'refund', advanceId: advance.id, max: advanceSummary(data, advance).held };

  if (loaded && !error && target) return <FundActionSheet asPage target={target} data={data} onClose={leave} onDone={leave} />;
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Hồ sơ ứng trước', headerShown: false }} />
      <ScreenTitle title="Hồ sơ ứng trước" topInset={insets.top} />
      {!loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <View style={[styles.notice, { backgroundColor: colors.surface }]}>
          <AppText color={error ? colors.danger : colors.muted} style={styles.noticeText}>
            {error ?? 'Không tìm thấy khoản giao tiền ứng này. Có thể nó đã bị xoá.'}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, marginTop: 4, borderRadius: AppRadius.card, padding: 16 },
  noticeText: { fontSize: 14, lineHeight: 20 },
});
