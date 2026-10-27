import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, EmptyState, ScreenTitle } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { PeriodNote } from '@/components/period-filter';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { dayHeading, periodToParams, suggestedDateFor } from '@/domain/expenses';
import { filterTransactions, groupTransactionsByDay, sumTransactions, type TransactionTab } from '@/domain/transactionList';
import { useTransactionBook } from '@/features/expenses/useTransactionBook';
import { useTransactionRows } from '@/features/expenses/useTransactionRows';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Bốn mục lọc cố định. */
const TAB_OPTIONS: readonly { value: TransactionTab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'expense', label: 'Chi tiêu' },
  { value: 'loan', label: 'Chuyển tiền' },
  { value: 'bill', label: 'Bill' },
];

/** Tiêu đề nhỏ của thẻ = tên của chip đang chọn. */
const TAB_TITLE: Record<TransactionTab, string> = { all: 'Tất cả', expense: 'Chi tiêu', loan: 'Chuyển tiền', bill: 'Bill' };

/**
 * Trang "Lịch sử giao dịch" (mở từ "Xem tất cả" ở Tổng quan): TẤT CẢ giao dịch tiền (chi tiêu cá nhân, chuyển tiền, bill) trong kỳ dùng chung, bốn mục lọc cố định, gom theo ngày. Kỳ đổi bằng cách bấm ghi chú ngày dưới tiêu đề thẻ (cùng kỳ dùng chung của cả ứng dụng).
 * Dùng cùng nguồn dữ liệu (`useTransactionBook`) và cách dựng dòng (`useTransactionRows`) với hai trang chi tiết riêng "Chi tiêu cá nhân" và "Chuyển tiền & bill", nhưng mỗi trang tự bố cục.
 * Khoản chi sinh từ Chia bill: ở Tất cả / Bill, Sửa / Xoá / chạm chuyển sang bill gốc; ở mục Chi tiêu thì khoá. Quy tắc từng mục lọc: `domain/transactionList`.
 */
export default function TransactionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = todayStr();
  const book = useTransactionBook();
  const [tab, setTab] = useState<TransactionTab>('all');
  const { renderEntry, closeAll } = useTransactionRows({
    settings: book.settings,
    bills: book.bills,
    period: book.period,
    reloadExpenses: book.reloadExpenses,
    reloadDebt: book.reloadDebt,
    lockBillExpenses: tab === 'expense',
  });

  const shown = useMemo(() => filterTransactions(book.entries, tab), [book.entries, tab]);
  const days = useMemo(() => groupTransactionsByDay(shown), [shown]);
  const totals = useMemo(() => sumTransactions(shown), [shown]);

  const empty = book.entries.length === 0 ? 'Chưa có giao dịch nào trong kỳ này' : 'Không có giao dịch nào thuộc mục này trong kỳ';
  const emptyAction =
    book.entries.length > 0
      ? undefined
      : tab === 'loan'
        ? { label: 'Ghi nhận chuyển tiền', onPress: () => router.push('/cong-no/ghi-nhan') }
        : tab === 'expense' || tab === 'all'
          ? { label: 'Thêm khoản chi', onPress: () => router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(book.period), d: suggestedDateFor(book.period, today) } }) }
          : undefined;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Lịch sử giao dịch', headerShown: false }} />
      <ScreenTitle title="Lịch sử giao dịch" topInset={insets.top} />
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
              <CardHead
                fit
                title={TAB_TITLE[tab]}
                subtitleNode={<PeriodNote view={book.view} onChange={book.setView} today={today} />}
                rightTop={`${totals.count} giao dịch`}
                rightBottom={
                  <View style={styles.totals}>
                    {/* Mục Chi tiêu không có khoản thu: vẫn giữ chỗ dòng "+" (ẩn) để khung đầu thẻ cao như nhau và các chip không nhảy khi đổi mục. */}
                    <AppText
                      color={colors.success}
                      style={[styles.total, tab === 'expense' && styles.hidden]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      accessibilityElementsHidden={tab === 'expense'}
                      importantForAccessibility={tab === 'expense' ? 'no-hide-descendants' : 'auto'}>
                      +{formatVnd(totals.in)}
                    </AppText>
                    <AppText color={colors.danger} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                      −{formatVnd(totals.out)}
                    </AppText>
                  </View>
                }
              />
            </View>

            <FixedTabs
              value={tab}
              onChange={(next) => {
                closeAll();
                setTab(next);
              }}
            />

            {days.length === 0 ? (
              <EmptyState text={empty} icon="check" action={emptyAction} />
            ) : (
              days.map((day) => {
                const dayTotals = sumTransactions(day.entries);
                return (
                  <View key={day.date} style={styles.day}>
                    <View style={styles.dayHeader}>
                      <AppText color={colors.muted} style={styles.dayName} numberOfLines={1}>
                        <AppText weight="semibold" style={styles.dayName}>
                          {dayHeading(day.date, today)}
                        </AppText>
                        , {formatVnDate(day.date)}
                      </AppText>
                      <AppText color={colors.muted} style={styles.dayName}>
                        {tab === 'expense' ? formatVnd(dayTotals.out) : `${day.entries.length} giao dịch`}
                      </AppText>
                    </View>
                    <View style={styles.rows}>{day.entries.map(renderEntry)}</View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </LockableScrollView>
    </View>
  );
}

/** Bốn nút lọc cố định (không cuộn ngang): bề rộng theo chữ, cùng đệm; mép trái nút đầu và mép phải nút cuối cách đều lề thẻ (12, bằng lề các dòng bên dưới), khoảng trống chia đều giữa các nút; nút đang chọn nền navy. */
function FixedTabs({ value, onChange }: { value: TransactionTab; onChange: (value: TransactionTab) => void }) {
  const colors = useColors();
  return (
    <View style={styles.tabs}>
      {TAB_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.tab, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <AppText weight="medium" color={selected ? colors.primaryInk : colors.ink} style={styles.tabText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
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
  totals: { alignItems: 'flex-end' },
  total: { fontSize: 11, lineHeight: 15 },
  hidden: { opacity: 0 },
  tabs: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingBottom: 4 },
  tab: { flexShrink: 1, height: 36, paddingHorizontal: 12, borderRadius: AppRadius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12 },
  day: { gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
