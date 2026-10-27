import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState, ScreenTitle } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { PeriodNote } from '@/components/period-filter';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { categoriesInUse, dayHeading, filterByCategory, periodToParams, suggestedDateFor } from '@/domain/expenses';
import { filterTransactions, groupTransactionsByDay, sumTransactions } from '@/domain/transactionList';
import { useTransactionBook } from '@/features/expenses/useTransactionBook';
import { useTransactionRows } from '@/features/expenses/useTransactionRows';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Trang "Lịch sử chi tiêu" (mở từ nút "Lịch sử chi tiêu cá nhân" và từ biểu đồ ở tab Chi tiêu): lịch sử MỌI khoản chi cá nhân của kỳ dùng chung (kể cả khoản tự sinh từ quỹ / bill / khoản trả,
 * đúng danh sách làm nên tổng chi tiêu), lọc theo mục chi bằng hàng nút cuộn ngang, gom theo ngày kèm tổng chi từng ngày. Dùng cùng nguồn dữ liệu và cách dựng dòng với trang Tất cả giao dịch
 * (`useTransactionBook`, `useTransactionRows`) nhưng bố cục riêng. Khoản chi tự sinh khoá sửa / xoá tại đây (nhãn "Sửa tại …" cho biết sửa ở đâu). Tiêu đề nhỏ của thẻ = tên chip đang chọn; kỳ đổi bằng cách bấm ghi chú ngày dưới tiêu đề thẻ. Tham số route `cat`: mục chi mở sẵn.
 */
export default function PersonalExpenseScreen() {
  const params = useLocalSearchParams<{ cat?: string }>();
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
    lockBillExpenses: true,
  });

  const [chip, setChip] = useState<string>(params.cat || 'all');
  const expenseEntries = useMemo(() => filterTransactions(book.entries, 'expense'), [book.entries]);
  const inUse = useMemo(() => categoriesInUse(book.items, book.settings), [book.items, book.settings]);
  // Mục đang chọn mà không còn khoản nào trong kỳ này thì quay về "Tất cả" (không đổi giá trị đã chọn).
  const activeCat = chip === 'all' || inUse.some((cat) => cat.id === chip) ? chip : 'all';
  const shown = useMemo(() => {
    if (activeCat === 'all') return expenseEntries;
    const ids = new Set(filterByCategory(book.items, book.settings, activeCat).map((item) => item.id));
    return expenseEntries.filter((entry) => entry.kind === 'expense' && ids.has(entry.expense.id));
  }, [expenseEntries, activeCat, book.items, book.settings]);
  const days = useMemo(() => groupTransactionsByDay(shown), [shown]);
  const totals = useMemo(() => sumTransactions(shown), [shown]);
  const options = useMemo(() => [{ value: 'all', label: 'Tất cả' }, ...inUse.map((cat) => ({ value: cat.id, label: cat.name }))], [inUse]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Lịch sử chi tiêu', headerShown: false }} />
      <ScreenTitle title="Lịch sử chi tiêu" topInset={insets.top} />
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
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.head}>
              <CardHead title={options.find((option) => option.value === activeCat)?.label ?? 'Tất cả'} subtitleNode={<PeriodNote view={book.view} onChange={book.setView} today={today} />} rightTop={`${totals.count} khoản chi`} rightBottom={formatVnd(totals.out)} />
            </View>

            <View style={styles.chips}>
              <ChipRow
                options={options}
                value={activeCat}
                onChange={(next) => {
                  closeAll();
                  setChip(next);
                }}
              />
            </View>

            {days.length === 0 ? (
              expenseEntries.length === 0 ? (
                <EmptyState
                  text="Chưa có khoản chi nào trong kỳ này. Mỗi khoản bạn ghi sẽ hiện ở đây, xếp theo ngày."
                  icon="check"
                  action={{ label: 'Thêm khoản chi', onPress: () => router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(book.period), d: suggestedDateFor(book.period, today) } }) }}
                />
              ) : (
                <EmptyState text="Không có khoản chi nào thuộc danh mục này trong kỳ" icon="check" />
              )
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
                      {formatVnd(sumTransactions(day.entries).out)}
                    </AppText>
                  </View>
                  <View style={styles.rows}>{day.entries.map(renderEntry)}</View>
                </View>
              ))
            )}
          </View>
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
  card: { borderRadius: AppRadius.card, overflow: 'hidden', paddingBottom: 12 },
  head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  chips: { paddingBottom: 4 },
  day: { gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
