import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { NavTile } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import {
  budgetSummary,
  initialPeriodView,
  periodOf,
  periodToParams,
  sumAmounts,
  suggestedDateFor,
} from '@/domain/expenses';
import { averagePerDay } from '@/domain/overviewStats';
import { AddExpenseFab } from '@/features/expenses/AddExpenseFab';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { BillDetailSection, BillStatCard } from '@/features/bills/BillOverviewCard';
import { DebtPeopleSection, DebtStatCard, PaysEntry } from '@/features/debts/DebtOverviewCards';
import { useDebtData } from '@/features/debts/hooks';
import { FundOverviewCard } from '@/features/funds/FundOverviewCard';
import { useFundData } from '@/features/funds/hooks';
import { PeriodBar } from '@/features/expenses/PeriodBar';
import { RecentTransactions } from '@/features/expenses/RecentTransactions';
import { SpentCard } from '@/features/expenses/SpentCard';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import { todayStr } from '@/utils/date';

/**
 * Màn Tổng quan: ô chọn kỳ dính ở mép trên, thẻ "Đã chi" và chi tiêu cá nhân theo mục.
 * Các khung Nợ / Giao dịch / Chia bill / Quỹ của PWA sẽ thêm khi làm các module tương ứng.
 */
export default function OverviewScreen() {
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref: scrollRef, props: scrollProps } = useChromeScroll();
  const [view, setView] = useState(() => initialPeriodView(today));
  const period = useMemo(() => periodOf(view), [view]);

  const { settings, error: settingsError } = useExpenseSettings();
  const { items, loaded, error } = useExpenses(period);
  const hasFunds = useFundData().data.funds.length > 0;
  const debt = useDebtData();

  const total = useMemo(() => sumAmounts(items), [items]);
  const average = useMemo(() => averagePerDay(total, period), [total, period]);
  const budget = useMemo(() => budgetSummary(total, period, settings, today), [total, period, settings, today]);
  const message = settingsError ?? error;

  const periodParams = periodToParams(period);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Phần tử đầu tiên là ô chọn kỳ và được ghim lại khi cuộn (sticky). */}
      <ScrollView ref={scrollRef} {...scrollProps} stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        <PeriodBar title="Tổng quan" view={view} onChange={setView} today={today} />
        <View style={styles.body}>
          {message ? (
            <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
              <AppText color={colors.danger} style={styles.noticeText}>
                {message}
              </AppText>
              {/* Khi thẻ tổng chi không hiện được vì lỗi, vẫn còn lối vào Cài đặt. */}
              <Pressable accessibilityRole="button" accessibilityLabel="Cài đặt" hitSlop={8} onPress={() => router.push('/thiet-lap')}>
                <SvgIcon name="gear" size={20} color={colors.danger} strokeWidth={1.9} />
              </Pressable>
            </View>
          ) : (
            <SpentCard
              period={period}
              loaded={loaded}
              total={total}
              count={items.length}
              average={average}
              budget={budget}
              onSettings={() => router.push('/thiet-lap')}
            />
          )}
          {debt.loaded && !debt.error && (
            <>
              <View style={styles.grid}>
                <BillStatCard bills={debt.bills} period={period} style={styles.gridItem} />
                <DebtStatCard bills={debt.bills} pays={debt.pays} period={period} style={styles.gridItem} />
              </View>
              <View style={styles.grid}>
                <NavTile icon="tabOverview" tint="orange" label="Chi tiêu" caption="Lịch sử chi tiêu" style={styles.gridItem} onPress={() => router.push({ pathname: '/lich-su', params: periodParams })} />
                <NavTile icon="people" tint="teal" label="Quỹ nhóm" caption="Đóng quỹ, chi quỹ" style={styles.gridItem} onPress={() => router.push('/quy')} />
              </View>
              <RecentTransactions pays={debt.pays} paysLoaded={debt.loaded} paysError={debt.error} />
              <BillDetailSection
                bills={debt.bills}
                pays={debt.pays}
                period={period}
                onOpenPerson={(name) => router.push({ pathname: '/chia-bill/nguoi', params: { ...periodParams, name } })}
                onOpenHistory={() => router.push({ pathname: '/chia-bill/lich-su', params: periodParams })}
              />
              <DebtPeopleSection
                bills={debt.bills}
                pays={debt.pays}
                period={period}
                onOpenPerson={(name) => router.push({ pathname: '/cong-no/chi-tiet', params: { ...periodParams, name } })}
              />
              <PaysEntry bills={debt.bills} pays={debt.pays} period={period} onOpen={() => router.push({ pathname: '/cong-no/lich-su', params: periodParams })} />
            </>
          )}
          <FundOverviewCard
            period={period}
            onOpenFund={(fund) => router.push({ pathname: '/quy/lich-su', params: { ...periodParams, fund } })}
          />
        </View>
      </ScrollView>

      <AddExpenseFab
        hasFunds={hasFunds}
        onTransfer={() => router.push('/cong-no/ghi-nhan')}
        onCreateBill={() => router.push('/chia-bill/tao')}
        onAddFund={() => router.push('/quy/chi-tieu')}
        onAddPersonal={() =>
          router.push({ pathname: '/chi-tieu/nhap', params: { ...periodParams, d: suggestedDateFor(period, today) } })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 6, gap: 12 },
  grid: { flexDirection: 'row', gap: 12 },
  gridItem: { flex: 1, minWidth: 0 },
  notice: { padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  noticeText: { flex: 1, fontSize: 15 },
});
