import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState, ScreenTitle } from '@/components/design';
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

/** Các mục lọc: khớp `typeLabel` của giao dịch; "Bill" gộp Chia bill và Trả bill (thẻ lịch sử vẫn ghi riêng từng loại). */
const BILL_TYPES = ['Chia bill', 'Trả bill'];
const TYPE_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Chi tiêu', label: 'Chi tiêu' },
  { value: 'Chuyển tiền', label: 'Chuyển tiền' },
  { value: 'bill', label: 'Bill' },
  { value: 'Quỹ nhóm', label: 'Quỹ nhóm' },
] as const;

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

  const [type, setType] = useState<string>('all');
  /** Lọc theo mục (loại giao dịch); các chip luôn đủ để chuyển qua lại. */
  const shown = useMemo(() => (type === 'all' ? list : list.filter((item) => (type === 'bill' ? BILL_TYPES.includes(item.typeLabel) : item.typeLabel === type))), [list, type]);

  const days = useMemo<Day[]>(() => {
    const groups: Day[] = [];
    for (const item of shown) {
      const last = groups[groups.length - 1];
      if (last && last.date === item.date) last.items.push(item);
      else groups.push({ date: item.date, items: [item] });
    }
    return groups;
  }, [shown]);
  const totalOut = shown.filter((item) => item.flow === 'out').reduce((sum, item) => sum + item.amount, 0);
  const totalIn = shown.filter((item) => item.flow === 'in').reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Giao dịch gần đây', headerShown: false }} />
      <ScreenTitle title="Giao dịch gần đây" topInset={insets.top} />
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
              <CardHead fit title="Tất cả giao dịch" subtitle={periodTitle(period)} rightTop={`${shown.length} giao dịch`}
                rightBottom={
                  <View style={styles.totals}>
                    <AppText color={colors.success} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                      +{formatVnd(totalIn)}
                    </AppText>
                    <AppText color={colors.danger} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                      −{formatVnd(totalOut)}
                    </AppText>
                  </View>
                }
              />
            </View>
            <ChipRow options={TYPE_OPTIONS} value={type} onChange={setType} />
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
                    <TransactionItemRow key={item.key} item={item} settings={settings} first={index === 0} showDate={false} />
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
  totals: { alignItems: 'flex-end' },
  total: { fontSize: 11, lineHeight: 15 },
  day: { paddingHorizontal: 16, paddingTop: 10 },
  dayName: { fontSize: 13, lineHeight: 18.85 },
});
