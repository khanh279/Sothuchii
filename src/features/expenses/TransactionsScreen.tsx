import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, EmptyState, ScreenTitle } from '@/components/design';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { dayHeading, periodTitle } from '@/domain/expenses';
import type { RecentTransaction } from '@/domain/recentTransactions';
import { TransactionItemRow } from '@/features/expenses/RecentTransactions';
import { useTransactionFeed } from '@/features/expenses/useTransactionFeed';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

interface Day {
  date: string;
  items: RecentTransaction[];
}

/**
 * Trang "Giao dịch" (mở từ "Xem tất cả" ở Tổng quan): TẤT CẢ giao dịch tiền trong kỳ dùng chung đang chọn, gộp từ HAI nguồn: chi tiêu cá nhân và
 * giao dịch (trả bill, chuyển tiền) qua `useTransactionFeed`, gom theo ngày, mới nhất trước. Chỉ xem, các dòng không bấm mở gì. Tổng ở đầu thẻ là tiền ra
 * của tôi (chi cá nhân + tiền tôi trả / chuyển đi), số tiền vào ghi riêng.
 */
export default function TransactionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = todayStr();
  const { period } = useSharedPeriod();
  const debt = useDebtData();
  const { list, settings, loaded, error } = useTransactionFeed({ window: period, filterPeriod: period, pays: debt.pays, paysLoaded: debt.loaded, paysError: debt.error, limit: Infinity });

  const days = useMemo<Day[]>(() => {
    const groups: Day[] = [];
    for (const item of list) {
      const last = groups[groups.length - 1];
      if (last && last.date === item.date) last.items.push(item);
      else groups.push({ date: item.date, items: [item] });
    }
    return groups;
  }, [list]);
  const totalOut = list.filter((item) => item.flow === 'out').reduce((sum, item) => sum + item.amount, 0);
  const totalIn = list.filter((item) => item.flow === 'in').reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Giao dịch', headerShown: false }} />
      <ScreenTitle title="Giao dịch" topInset={insets.top} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        {error ? (
          <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
            <AppText color={colors.danger} style={styles.noticeText}>
              {error}
            </AppText>
          </View>
        ) : !loaded ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.head}>
              <CardHead title="Tất cả giao dịch" subtitle={periodTitle(period)} rightTop={`${list.length} giao dịch`} rightBottom={`−${formatVnd(totalOut)}${totalIn > 0 ? ` · +${formatVnd(totalIn)}` : ''}`} />
            </View>
            {days.length === 0 ? (
              <EmptyState text="Không có giao dịch nào trong kỳ này" icon="check" />
            ) : (
              days.map((day) => (
                <View key={day.date} style={styles.day}>
                  <AppText color={colors.muted} style={styles.dayName} numberOfLines={1}>
                    <AppText weight="semibold" style={styles.dayName}>
                      {dayHeading(day.date, today)}
                    </AppText>
                    , {formatVnDate(day.date)}
                  </AppText>
                  {day.items.map((item, index) => (
                    <TransactionItemRow key={item.key} item={item} settings={settings} first={index === 0} />
                  ))}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  notice: { borderRadius: 16, padding: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden', paddingBottom: 8 },
  head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  day: { paddingHorizontal: 16, paddingTop: 10 },
  dayName: { fontSize: 13, lineHeight: 18.85 },
});
