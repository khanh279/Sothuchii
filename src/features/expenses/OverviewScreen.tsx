import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, PwaColors } from '@/constants/theme';
import {
  budgetSummary,
  initialPeriodView,
  periodOf,
  periodToParams,
  sumAmounts,
  suggestedDateFor,
  summarizeByCategory,
} from '@/domain/expenses';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { PeriodBar } from '@/features/expenses/PeriodBar';
import { SpentCard } from '@/features/expenses/SpentCard';
import { todayStr } from '@/utils/date';

/** Màn Tổng quan: chọn kỳ xem, thẻ "Đã chi" và chi tiêu cá nhân theo mục. */
export default function OverviewScreen() {
  const today = todayStr();
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Tổng quan</Text>
        <PeriodBar view={view} onChange={setView} today={today} />
        {message ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{message}</Text>
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
      </ScrollView>

      <Pressable
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel="Thêm khoản chi"
        onPress={() => router.push({ pathname: '/chi-tieu/nhap', params: { d: suggestedDateFor(period, today) } })}>
        <Text style={styles.fabText}>+ Chi tiêu</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PwaColors.bg },
  content: { padding: 16, gap: 16, paddingBottom: BottomTabInset + 96 },
  title: { fontSize: 28, fontWeight: '700', color: PwaColors.ink },
  notice: { padding: 16, borderRadius: 16, backgroundColor: PwaColors.dangerSoft },
  noticeText: { color: PwaColors.danger, fontSize: 15 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: BottomTabInset + 16,
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: PwaColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: PwaColors.primaryInk, fontSize: 16, fontWeight: '700' },
});
