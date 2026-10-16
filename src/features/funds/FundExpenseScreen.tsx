import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { fundBalance } from '@/domain/funds';
import { FundExpenseForm } from '@/features/funds/FundExpenseForm';
import { useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';

/** Quay lại màn trước; nếu không có màn trước (mở thẳng trang này) thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Trang "Chi tiêu quỹ" mở từ nút nổi "+ Chi tiêu" ở Tổng quan (mục `data-fm="cq"` của PWA): dùng chung giao diện với trang
 * Chi tiêu cá nhân (số tiền, nội dung, hàng Ngày | Quỹ); lưu xong quay lại. Chỉ dùng được khi đã có quỹ.
 */
export default function FundExpenseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, loaded, error } = useFundData();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const fund = data.funds.find((item) => item.id === pickedId) ?? data.funds[0] ?? null;

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
  } else if (!fund) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 }]}>
        <AppText color={colors.muted} style={styles.noticeText}>
          Chưa có quỹ nào. Hãy tạo quỹ ở trang Giao dịch trước khi ghi chi tiêu quỹ.
        </AppText>
      </View>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <FundExpenseForm
          variant="page"
          fund={fund}
          funds={data.funds}
          onPickFund={setPickedId}
          balance={fundBalance(data, fund.id)}
          onChanged={leave}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Chi tiêu quỹ', headerShown: false }} />
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={leave} style={styles.back}>
          <SvgIcon name="chevronLeft" size={22} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <AppText weight="semibold" style={styles.barTitle}>
          Chi tiêu quỹ
        </AppText>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 48 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barTitle: { fontSize: 17 },
  content: { paddingHorizontal: 12, paddingTop: 4 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, marginTop: 8, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
});
