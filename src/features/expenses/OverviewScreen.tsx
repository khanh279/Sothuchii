import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import {
  budgetSummary,
  initialPeriodView,
  periodOf,
  periodToParams,
  sumAmounts,
  suggestedDateFor,
  summarizeByCategory,
} from '@/domain/expenses';
import { AddExpenseFab } from '@/features/expenses/AddExpenseFab';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { BillOverviewCard } from '@/features/bills/BillOverviewCard';
import { DebtOverviewCards } from '@/features/debts/DebtOverviewCards';
import { FundOverviewCard } from '@/features/funds/FundOverviewCard';
import { PeriodBar } from '@/features/expenses/PeriodBar';
import { SpentCard } from '@/features/expenses/SpentCard';
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
  const [view, setView] = useState(() => initialPeriodView(today));
  const [expanded, setExpanded] = useState(false);
  const period = useMemo(() => periodOf(view), [view]);

  const { settings, error: settingsError } = useExpenseSettings();
  const { items, loaded, error } = useExpenses(period);

  const total = useMemo(() => sumAmounts(items), [items]);
  const summaries = useMemo(() => summarizeByCategory(items, settings), [items, settings]);
  const budget = useMemo(() => budgetSummary(total, period, settings, today), [total, period, settings, today]);
  const message = settingsError ?? error;

  const periodParams = periodToParams(period);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Phần tử đầu tiên là ô chọn kỳ và được ghim lại khi cuộn (sticky). */}
      <ScrollView stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: 92 + insets.bottom }}>
        <PeriodBar view={view} onChange={setView} today={today} />
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
              loaded={loaded}
              total={total}
              budget={budget}
              summaries={summaries}
              expanded={expanded}
              onToggle={() => setExpanded((open) => !open)}
              onOpenCategory={(cat) => router.push({ pathname: '/lich-su', params: { ...periodParams, cat } })}
              onOpenAll={() => router.push({ pathname: '/lich-su', params: periodParams })}
            />
          )}
          <DebtOverviewCards
            period={period}
            onOpenPerson={(name) => router.push({ pathname: '/cong-no/chi-tiet', params: { ...periodParams, name } })}
            onOpenPair={(x, z) => router.push({ pathname: '/cong-no/chi-tiet', params: { ...periodParams, x, z } })}
            onOpenPays={() => router.push({ pathname: '/cong-no/lich-su', params: periodParams })}
          />
          <BillOverviewCard period={period} onOpen={() => router.push({ pathname: '/chia-bill/lich-su', params: periodParams })} />
          <FundOverviewCard
            period={period}
            onOpenFund={(fund) => router.push({ pathname: '/quy/lich-su', params: { ...periodParams, fund } })}
          />
        </View>
      </ScrollView>

      <AddExpenseFab
        onAddPersonal={() =>
          router.push({ pathname: '/chi-tieu/nhap', params: { ...periodParams, d: suggestedDateFor(period, today) } })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 12, paddingTop: 12, gap: 12 },
  notice: { padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
});
