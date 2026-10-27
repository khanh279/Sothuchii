import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState, ScreenTitle } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { PeriodNote } from '@/components/period-filter';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { dayHeading } from '@/domain/expenses';
import { filterTransactions, groupTransactionsByDay, sumTransactions } from '@/domain/transactionList';
import { useTransactionBook } from '@/features/expenses/useTransactionBook';
import { useTransactionRows } from '@/features/expenses/useTransactionRows';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

type Chip = 'all' | 'loan' | 'bill';
const CHIPS: readonly { value: Chip; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'loan', label: 'Chuyển tiền' },
  { value: 'bill', label: 'Bill' },
];

/**
 * Trang "Lịch sử chuyển tiền & bill" (mở từ nút "Chi tiết giao dịch" ở tab Nợ & bill): GỘP khoản chuyển tiền và bill của kỳ dùng chung (khoản trả, trả bill và khoản chi sinh từ Chia bill, kể cả khoản giữa
 * những người khác), không có chi tiêu thường. Dùng cùng nguồn dữ liệu và cách dựng dòng với trang Tất cả giao dịch (`useTransactionBook`, `useTransactionRows`) nhưng bố cục riêng: thẻ tóm tắt
 * "Tôi chi ra / Tôi nhận" rồi danh sách có ba nút lọc. Khoản chi sinh từ Chia bill: Sửa / Xoá / chạm chuyển sang bill gốc.
 */
export default function TransferBillScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = todayStr();
  const book = useTransactionBook();
  const { renderEntry, closeAll } = useTransactionRows({
    settings: book.settings,
    bills: book.bills,
    period: book.period,
    reloadExpenses: book.reloadExpenses,
    reloadDebt: book.reloadDebt,
    lockBillExpenses: false,
  });

  const [chip, setChip] = useState<Chip>('all');
  const base = useMemo(() => filterTransactions(book.entries, 'loanBill'), [book.entries]);
  const shown = useMemo(() => (chip === 'all' ? base : filterTransactions(base, chip)), [base, chip]);
  const days = useMemo(() => groupTransactionsByDay(shown), [shown]);
  const totals = useMemo(() => sumTransactions(shown), [shown]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Lịch sử chuyển tiền & bill', headerShown: false }} />
      <ScreenTitle title="Lịch sử chuyển tiền & bill" topInset={insets.top} />
      <LockableScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} onScrollBeginDrag={closeAll} keyboardShouldPersistTaps="handled">
        {book.message ? (
          <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
            <AppText color={colors.danger} style={styles.noticeText}>
              {book.message}
            </AppText>
          </View>
        ) : !book.loaded ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.head}>
                <CardHead
                  title={CHIPS.find((option) => option.value === chip)?.label ?? 'Tất cả'}
                  subtitleNode={<PeriodNote view={book.view} onChange={book.setView} today={today} />}
                  rightTop={`${totals.count} giao dịch`}
                  rightBottom={
                    <View style={styles.totals}>
                      <AppText color={colors.success} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                        +{formatVnd(totals.in)}
                      </AppText>
                      <AppText color={colors.danger} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                        −{formatVnd(totals.out)}
                      </AppText>
                    </View>
                  }
                />
              </View>
              <View style={styles.chips}>
                <ChipRow
                  options={CHIPS}
                  value={chip}
                  onChange={(next) => {
                    closeAll();
                    setChip(next);
                  }}
                />
              </View>

              {days.length === 0 ? (
                <EmptyState
                  text={base.length === 0 ? 'Chưa có giao dịch nào trong kỳ này' : 'Không có giao dịch nào thuộc mục này trong kỳ'}
                  icon="check"
                  action={base.length === 0 || chip === 'loan' ? { label: 'Ghi nhận chuyển tiền', onPress: () => router.push('/cong-no/ghi-nhan') } : undefined}
                />
              ) : (
                days.map((day) => (
                  <View key={day.date} style={styles.day}>
                    <View style={styles.dayHeader}>
                      <AppText color={colors.muted} style={styles.dayName} numberOfLines={1}>
                        <AppText weight="semibold" style={styles.dayName}>
                          {dayHeading(day.date, today)}
                        </AppText>
                        , {formatVnDate(day.date)}
                      </AppText>
                      <AppText color={colors.muted} style={styles.dayName}>
                        {`${day.entries.length} giao dịch`}
                      </AppText>
                    </View>
                    <View style={styles.rows}>{day.entries.map(renderEntry)}</View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </LockableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  notice: { borderRadius: 16, padding: 16 },
  noticeText: { fontSize: 15 },
  totals: { alignItems: 'flex-end' },
  total: { fontSize: 11, lineHeight: 15 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden', paddingBottom: 12 },
  head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  chips: { paddingBottom: 4 },
  day: { gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
