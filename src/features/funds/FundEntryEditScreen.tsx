import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { FormPage } from '@/components/form-page';
import { ScreenTitle } from '@/components/design';
import { fundPosition } from '@/domain/fundAdvance';
import { fundBalance } from '@/domain/funds';
import { ContributionForm } from '@/features/funds/ContributionForm';
import { FundActionSheet } from '@/features/funds/FundActionSheet';
import { FundExpenseForm } from '@/features/funds/FundExpenseForm';
import { useFundData } from '@/features/funds/hooks';
import { buildTxnEditTarget } from '@/features/funds/txnEditTarget';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

/** Quay lại màn trước (Lịch sử quỹ tự đọc lại dữ liệu khi được mở lại); mở thẳng trang này thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * TRANG sửa một dòng lịch sử quỹ (tham số route `kind` = contribution | expense | advance | refund | payout, `id` = mã), mở bằng vuốt dòng → Sửa ở Lịch sử quỹ.
 * Hiện như các trang khác (tiêu đề ở đầu trang, biểu mẫu trong thẻ, vuốt cạnh trái để quay lại) thay cho khung phủ toàn màn hình: đóng thu quỹ, chi quỹ,
 * giao tiền ứng dùng lại đúng các form có sẵn; hoàn tiền / thanh toán dùng lại `FundActionSheet` ở chế độ trang. Lưu xong quay lại.
 */
export default function FundEntryEditScreen() {
  const { kind = '', id = '' } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, loaded, error } = useFundData();

  const contribution = useMemo(() => (kind === 'contribution' ? data.contribs.find((item) => item.id === id) : undefined), [data, kind, id]);
  const expense = useMemo(() => (kind === 'expense' ? data.expenses.find((item) => item.id === id) : undefined), [data, kind, id]);
  const advance = useMemo(() => (kind === 'advance' ? data.advances?.find((item) => item.id === id) : undefined), [data, kind, id]);
  const txn = useMemo(() => (kind === 'refund' || kind === 'payout' ? buildTxnEditTarget(data, id) : null), [data, kind, id]);
  const fundId = contribution?.fundId ?? expense?.fundId ?? advance?.fundId;
  const fund = data.funds.find((item) => item.id === fundId);

  const heading = contribution ? 'Sửa thu quỹ' : advance ? 'Sửa giao tiền ứng' : expense ? 'Sửa chi tiêu quỹ' : kind === 'refund' ? 'Sửa hoàn tiền ứng' : 'Sửa thanh toán';

  function message(text: string, danger = false) {
    return (
      <View style={styles.page}>
        <Stack.Screen options={{ title: heading, headerShown: false }} />
        <ScreenTitle title={heading} topInset={insets.top} />
        <View style={[styles.notice, { backgroundColor: danger ? colors.dangerSoft : colors.surface }]}>
          <AppText color={danger ? colors.danger : colors.muted} style={styles.noticeText}>
            {text}
          </AppText>
        </View>
      </View>
    );
  }

  if (error) return message(error, true);
  if (!loaded) {
    return (
      <View style={[styles.page, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ title: heading, headerShown: false }} />
        <ScreenTitle title={heading} topInset={insets.top} />
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      </View>
    );
  }

  if (txn) return <FundActionSheet asPage target={txn.target} data={txn.data} existing={txn.existing} onClose={leave} onDone={leave} />;
  if (fund && contribution) {
    return (
      <FormPage title={heading}>
        <ContributionForm fund={fund} existing={contribution} onChanged={leave} />
      </FormPage>
    );
  }
  if (fund && (expense || advance)) {
    return (
      <FormPage title={heading}>
        <FundExpenseForm
          fund={fund}
          existing={expense}
          existingAdvance={advance}
          showTitle={false}
          balance={fundBalance(data, fund.id)}
          cash={fundPosition(data, fund.id).cash}
          onChanged={leave}
        />
      </FormPage>
    );
  }
  return message('Không tìm thấy khoản này. Có thể nó đã bị xoá.');
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, marginTop: 8, padding: 16, borderRadius: AppRadius.card },
  noticeText: { fontSize: 15 },
});
