import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ScreenTitle } from '@/components/design';
import { loadBills } from '@/data/billRepository';
import BillCalcScreen from '@/features/bills/BillCalcScreen';
import { describeBillError } from '@/features/bills/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Bill } from '@/types/bill';

type Loaded = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; bill: Bill | null };

/** Quay lại màn trước; nếu không có màn trước (mở thẳng trang này) thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Sửa một bill đã lưu (tham số route `id`): dùng lại màn tính chia với dữ liệu của bill đó. */
export default function EditBillRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadBills()
      .then((bills) => !cancelled && setState({ status: 'ready', bill: bills.find((bill) => bill.id === id) ?? null }))
      .catch((e) => !cancelled && setState({ status: 'error', message: describeBillError(e) }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  let body;
  if (state.status === 'loading') body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (state.status === 'error' || !state.bill) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          {state.status === 'error' ? state.message : 'Không tìm thấy bill này. Có thể nó đã bị xoá.'}
        </AppText>
      </View>
    );
  } else body = <BillCalcScreen existing={state.bill} onFinished={leave} />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Sửa bill', headerShown: false }} />
      <ScreenTitle title="Sửa bill" topInset={insets.top} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
});
