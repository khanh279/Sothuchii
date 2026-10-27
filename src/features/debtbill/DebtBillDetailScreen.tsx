import { Stack, router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ScreenTitle } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { buildBillPairs } from '@/domain/billPairs';
import { buildLoanPeople } from '@/domain/debtOverview';
import { periodTitle } from '@/domain/expenses';
import { BillPairsZones } from '@/features/bills/BillPairsPanel';
import { DebtPeopleZones } from '@/features/debts/DebtPeoplePanel';
import { useDebtData } from '@/features/debts/hooks';
import { DebtBlock, SignedTotals } from '@/features/debtbill/DebtBlock';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';

/**
 * Trang "Chi tiết nợ & bill" (mở từ nút ở thẻ Nợ của tab Nợ & bill): hai khối trong một thẻ — "Nợ vay" (sổ chuyển tiền, toàn thời gian, theo người; chạm một người để mở công nợ của họ)
 * và "Nợ bill" (các cặp cần thanh toán bill của TẤT CẢ thời gian; chạm một cặp để mở trang thanh toán). Không có logic tính nợ riêng: dùng lại các hàm domain và các khối hiện có.
 */
/** Trang này luôn xem TẤT CẢ thời gian, không theo kỳ dùng chung và không có ô chọn kỳ. */
const ALL_TIME: Period = { mode: 'all' };

export default function DebtBillDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const period = ALL_TIME;
  const { bills, pays, loaded, error } = useDebtData();

  const loanPeople = useMemo(() => buildLoanPeople(bills, pays), [bills, pays]);
  const pairs = useMemo(() => buildBillPairs(bills, pays, period), [bills, pays, period]);
  // Tổng bên phải tiêu đề mỗi khối: nợ tôi (+, xanh) và tôi nợ (−, đỏ); cặp người khác không tính.
  const loanTotals = useMemo(
    () => ({
      get: loanPeople.filter((person) => person.tone === 'get').reduce((sum, person) => sum + person.total, 0),
      owe: loanPeople.filter((person) => person.tone === 'owe').reduce((sum, person) => sum - person.total, 0),
    }),
    [loanPeople],
  );
  const billTotals = useMemo(
    () => ({
      get: pairs.filter((pair) => pair.to === BILL_OWNER_NAME).reduce((sum, pair) => sum + pair.remaining, 0),
      owe: pairs.filter((pair) => pair.from === BILL_OWNER_NAME).reduce((sum, pair) => sum + pair.remaining, 0),
    }),
    [pairs],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết nợ', headerShown: false }} />
      <ScreenTitle title="Chi tiết nợ" topInset={insets.top} />
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <LockableScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <DebtBlock title="Nợ vay" note="Toàn thời gian" right={<SignedTotals get={loanTotals.get} owe={loanTotals.owe} />}>
              <DebtPeopleZones people={loanPeople} onOpen={(name) => router.push({ pathname: '/cong-no/vay', params: { name } })} />
            </DebtBlock>
            <DebtBlock title="Nợ bill" note={periodTitle(period)} right={<SignedTotals get={billTotals.get} owe={billTotals.owe} />}>
              <BillPairsZones pairs={pairs} onOpen={(key) => router.push({ pathname: '/chia-bill/thanh-toan', params: { pair: key } })} />
            </DebtBlock>
          </View>
        </LockableScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: PageLayout.paddingX, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
});
