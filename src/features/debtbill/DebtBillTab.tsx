import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ScreenTitle, SectionCard } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { SvgIcon } from '@/components/svg-icon';
import { PageLayout } from '@/constants/layout';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { buildBillPairs } from '@/domain/billPairs';
import { buildBillOverviewCard } from '@/domain/billHistory';
import { buildLoanPeople } from '@/domain/debtOverview';
import { periodTitle, periodToParams } from '@/domain/expenses';
import { BillPairsZones, BillSpenderRows } from '@/features/bills/BillPairsPanel';
import { DebtPeopleZones, DebtTotalTiles } from '@/features/debts/DebtPeoplePanel';
import { useDebtData } from '@/features/debts/hooks';
import { PayTransactions } from '@/features/debts/PayTransactions';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { formatVnd } from '@/utils/format';

/**
 * Tab "Nợ & bill" (gộp hai tab Chia bill và Công nợ cũ), ba thẻ cuộn cùng nhau:
 * (1) Tổng quan: hai ô "Tôi nợ" / "Nợ tôi" (toàn thời gian), bên dưới là ai chi nhiều hay ít (3 người đầu, bill trong kỳ chung); mũi tên cuối thẻ mở trang danh sách bill riêng.
 * (2) Chi tiết nợ: hai khung — "Nợ vay" (sổ chuyển tiền, toàn thời gian, theo người) và "Nợ bill" (các cặp cần thanh toán bill, theo kỳ chung, như trang Thanh toán bill cũ).
 * (3) Giao dịch: lịch sử trả / chuyển tiền như tab Công nợ cũ. Không có logic tính nợ riêng ở đây: dùng lại các hàm domain và các thẻ hiện có.
 */
export default function DebtBillTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref, props } = useChromeScroll();
  const { period } = useSharedPeriod();
  const { bills, pays, loaded, error, reload } = useDebtData();

  const card = useMemo(() => buildBillOverviewCard(bills, period, false), [bills, period]);
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
      <ScreenTitle title="Nợ & bill" topInset={insets.top} />
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <LockableScrollView ref={ref} {...props} contentContainerStyle={[styles.content, { paddingBottom: PageLayout.bottomClearance + insets.bottom }]}>
          <SectionCard title="Tổng quan">
            <View style={styles.inner}>
              <DebtTotalTiles bills={bills} pays={pays} />
              <DebtBlock title="Người chi bill" note={periodTitle(period)}>
                <BillSpenderRows rows={card.rows} />
              </DebtBlock>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xem tất cả bill"
                hitSlop={8}
                onPress={() => router.push({ pathname: '/chia-bill/lich-su', params: periodToParams(period) })}
                style={styles.seeAll}
              >
                <SvgIcon name="chevronRight" size={18} color={colors.muted} strokeWidth={2.2} />
              </Pressable>
            </View>
          </SectionCard>

          <SectionCard title="Chi tiết nợ & bill">
            <View style={styles.sections}>
              <DebtBlock title="Nợ vay" note="Toàn thời gian" right={<SignedTotals get={loanTotals.get} owe={loanTotals.owe} />}>
                <DebtPeopleZones people={loanPeople} onOpen={(name) => router.push({ pathname: '/cong-no/vay', params: { name } })} />
              </DebtBlock>
              <DebtBlock title="Nợ bill" note={periodTitle(period)} right={<SignedTotals get={billTotals.get} owe={billTotals.owe} />}>
                <BillPairsZones pairs={pairs} onOpen={(key) => router.push({ pathname: '/chia-bill/thanh-toan', params: { pair: key } })} />
              </DebtBlock>
            </View>
          </SectionCard>

          <PayTransactions bills={bills} pays={pays} reload={reload} />
        </LockableScrollView>
      )}

    </View>
  );
}

/** Hai dòng căn phải: `+số` màu xanh (người khác nợ tôi) trên, `−số` màu đỏ (tôi nợ) dưới; không có thì vẫn hiện +0 / −0. Cỡ chữ như hai dòng tổng + / − ở trang "Giao dịch gần đây" (11, không đậm). */
function SignedTotals({ get, owe }: { get: number; owe: number }) {
  const colors = useColors();
  return (
    <View style={styles.totals}>
      <AppText color={colors.success} style={styles.totalLine}>
        +{formatVnd(get)}
      </AppText>
      <AppText color={colors.danger} style={styles.totalLine}>
        −{formatVnd(owe)}
      </AppText>
    </View>
  );
}

/** Một khối con KHÔNG khung viền: tiêu đề đậm và ghi chú nhỏ mờ ngay bên dưới (thời gian), rồi nội dung. */
function DebtBlock({ title, note, right, children }: { title: string; note: string; right?: React.ReactNode; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <View style={styles.blockLeft}>
          <AppText weight="bold" style={styles.blockTitle}>
            {title}
          </AppText>
          <AppText color={colors.muted} style={styles.blockNote} numberOfLines={1}>
            {note}
          </AppText>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  inner: { gap: 12 },
  seeAll: { alignSelf: 'center', paddingVertical: 2 },
  sections: { gap: 12 },
  block: { gap: 6 },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  blockLeft: { flex: 1, minWidth: 0 },
  totals: { alignItems: 'flex-end', flexShrink: 0 },
  totalLine: { fontSize: 11, lineHeight: 15, textAlign: 'right' },
  blockTitle: { fontSize: 15.5, lineHeight: 21 },
  blockNote: { fontSize: 12.5, lineHeight: 17 },
});
