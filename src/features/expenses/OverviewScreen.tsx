import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import {
  budgetSummary,
  sumAmounts,
} from '@/domain/expenses';
import { cleanOrphanPhotos } from '@/data/photoCleanup';
import { applyRecurring } from '@/data/recurringService';
import { averagePerDay } from '@/domain/overviewStats';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { BillStatCard } from '@/features/bills/BillOverviewCard';
import { DebtSplitCard, DebtStatCard } from '@/features/debts/DebtOverviewCards';
import { useDebtData } from '@/features/debts/hooks';
import { PageLayout } from '@/constants/layout';
import { ScreenTitle } from '@/components/design';
import { SettingsMenuButton } from '@/features/expenses/SettingsMenuButton';
import { FundStatCard } from '@/features/funds/FundOverviewCard';
import { RecentTransactions } from '@/features/expenses/RecentTransactions';
import { SpentCard } from '@/features/expenses/SpentCard';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { useColors } from '@/hooks/use-colors';
import { todayStr } from '@/utils/date';

/**
 * Màn Tổng quan: tiêu đề dính ở mép trên (nút bánh răng Cài đặt ở góc phải), thẻ "Tổng chi tiêu" kèm ghi chú kỳ nhỏ chọn được, và chi tiêu cá nhân theo mục.
 * Bốn thẻ chỉ để xem, chia 2 hàng: Công nợ (trái) + Tôi nợ / Nợ tôi (phải); Chia bill (trái) + Quỹ nhóm (phải) (không bấm); mỗi mục có tab riêng. "Giao dịch gần đây" gộp chi tiêu, chi quỹ, bill và chuyển tiền.
 */
export default function OverviewScreen() {
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref: scrollRef, props: scrollProps } = useChromeScroll();
  const { view, setView, period } = useSharedPeriod();

  const { settings, error: settingsError } = useExpenseSettings();
  // Mở app: ghi các khoản chi tiêu định kỳ đã đến hạn (xem `applyRecurring`); lỗi không chặn màn hình.
  useEffect(() => {
    void applyRecurring().catch(() => undefined);
    // Dọn ảnh mồ côi (ảnh đã bỏ / chưa lưu từ hơn một ngày trước), chạy chậm sau khi màn hình đã hiện.
    const timer = setTimeout(() => void cleanOrphanPhotos(), 8000);
    return () => clearTimeout(timer);
  }, []);
  const { items, loaded, error } = useExpenses(period);
  const debt = useDebtData();

  const total = useMemo(() => sumAmounts(items), [items]);
  const average = useMemo(() => averagePerDay(total, period), [total, period]);
  const budget = useMemo(() => budgetSummary(total, period, settings, today), [total, period, settings, today]);
  const message = settingsError ?? error;


  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Phần tử đầu tiên là tiêu đề (kèm nút bánh răng Cài đặt ở góc phải) và được ghim lại khi cuộn (sticky). */}
      <ScrollView ref={scrollRef} {...scrollProps} stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: PageLayout.bottomClearance + insets.bottom }}>
        <View style={{ backgroundColor: colors.bg }}>
          <ScreenTitle title="Tổng quan" topInset={insets.top} right={<SettingsMenuButton />} />
        </View>
        <View style={styles.body}>
          {message ? (
            <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
              <AppText color={colors.danger} style={styles.noticeText}>
                {message}
              </AppText>
            </View>
          ) : (
            <SpentCard
              period={period}
              view={view}
              onViewChange={setView}
              today={today}
              loaded={loaded}
              total={total}
              count={items.length}
              average={average}
              budget={budget}
            />
          )}
          {debt.loaded && !debt.error && (
            <>
              <View style={styles.grid}>
                <DebtStatCard bills={debt.bills} pays={debt.pays} period={period} style={styles.gridItem} />
                <DebtSplitCard bills={debt.bills} pays={debt.pays} period={period} style={styles.gridItem} />
              </View>
              <View style={styles.grid}>
                <BillStatCard bills={debt.bills} period={period} style={styles.gridItem} />
                <FundStatCard style={styles.gridItem} />
              </View>
              <RecentTransactions pays={debt.pays} paysLoaded={debt.loaded} paysError={debt.error} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: PageLayout.paddingX, paddingTop: 6, gap: PageLayout.gap },
  grid: { flexDirection: 'row', gap: 12 },
  gridItem: { flex: 1, minWidth: 0 },
  notice: { padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  noticeText: { flex: 1, fontSize: 15 },
});
