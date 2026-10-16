import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, ChipRow, SegmentedControl } from '@/components/design';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deletePaySynced } from '@/data/payService';
import {
  categoriesInUse,
  dayHeading,
  filterByCategory,
  groupByDay,
  initialPeriodView,
  periodOf,
  periodTitle,
  periodToParams,
  suggestedDateFor,
  sumAmounts,
} from '@/domain/expenses';
import {
  PAY_FILTER_LABEL,
  countPayRows,
  expenseLinkLabel,
  filterPayDays,
  payLinkLabel,
  payTypesInUse,
  type PayFilter,
  type PaySegment,
} from '@/domain/expenseTab';
import { buildPayHistory, type PayRow } from '@/domain/payForm';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { PayRowView } from '@/features/debts/PayHistoryScreen';
import { ExpenseRow } from '@/features/expenses/HistoryScreen';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { PeriodBar } from '@/features/expenses/PeriodBar';
import { useExpenseRowActions } from '@/features/expenses/useExpenseRowActions';
import { useColors } from '@/hooks/use-colors';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatGrouped, formatVnd } from '@/utils/format';

const SEGMENTS: { value: PaySegment; label: string }[] = [
  { value: 'expense', label: 'Chi tiêu' },
  { value: 'pay', label: 'Giao dịch' },
];

/**
 * Tab "Chi tiêu": thẻ tổng chi tiêu của kỳ, thanh chuyển giữa hai mục và một hàng nút lọc cuộn ngang.
 * - Chi tiêu: các khoản chi cá nhân (kể cả khoản tự sinh từ chia bill / quỹ, vẫn bị khoá sửa/xoá), lọc theo danh mục cá nhân đang dùng.
 * - Giao dịch: các khoản trả / chuyển tiền (không gồm gộp nợ), lọc theo loại có trong dữ liệu (trả bill / chuyển tiền).
 * Tổng ở thẻ CHỈ là tổng khoản chi cá nhân, không cộng khoản trả (khoản chi `cb` do khoản trả sinh ra đã nằm trong tổng). Kỳ, mục đang xem và
 * hai bộ lọc đều được nhớ riêng khi chuyển tab rồi quay lại. Không dùng chung kỳ với Tổng quan.
 */
export default function ExpensesTab() {
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const toast = useToast();

  const [view, setView] = usePersistedState('tab:chi-tieu:view', () => initialPeriodView(today));
  const [segment, setSegment] = usePersistedState<PaySegment>('tab:chi-tieu:segment', () => 'expense');
  const [catChip, setCatChip] = usePersistedState<string>('tab:chi-tieu:chip', () => 'all');
  const [payChip, setPayChip] = usePersistedState<PayFilter>('tab:chi-tieu:payChip', () => 'all');
  const period = useMemo(() => periodOf(view), [view]);

  const { settings, error: settingsError } = useExpenseSettings();
  const { items, loaded, error, reload } = useExpenses(period);
  const debt = useDebtData();
  const { openId, setOpenId, remove, edit, openDetail } = useExpenseRowActions({ period, reload });
  const { closeAll, rowProps } = useSingleOpenRow();

  const total = useMemo(() => sumAmounts(items), [items]);
  const inUse = useMemo(() => categoriesInUse(items, settings), [items, settings]);
  // Chip đang chọn mà không còn khoản nào trong kỳ này thì quay về "Tất cả" (không đổi giá trị đã nhớ).
  const activeCat = catChip === 'all' || inUse.some((cat) => cat.id === catChip) ? catChip : 'all';
  const groups = useMemo(() => groupByDay(filterByCategory(items, settings, activeCat)), [items, settings, activeCat]);
  const visibleCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const visibleTotal = groups.reduce((sum, group) => sum + group.total, 0);

  const history = useMemo(() => buildPayHistory(debt.pays, debt.bills, period), [debt.pays, debt.bills, period]);
  const payTypes = useMemo(() => payTypesInUse(history.days), [history.days]);
  const activePay: PayFilter = payChip === 'all' || payTypes.includes(payChip) ? payChip : 'all';
  const payDays = useMemo(() => filterPayDays(history.days, activePay), [history.days, activePay]);
  const payCount = countPayRows(payDays);

  const catOptions = useMemo(() => [{ value: 'all', label: 'Tất cả' }, ...inUse.map((cat) => ({ value: cat.id, label: cat.name }))], [inUse]);
  const payOptions = useMemo(
    () => [{ value: 'all' as PayFilter, label: PAY_FILTER_LABEL.all }, ...payTypes.map((type) => ({ value: type as PayFilter, label: PAY_FILTER_LABEL[type] }))],
    [payTypes],
  );

  const expenseMessage = settingsError ?? error;
  const isExpense = segment === 'expense';

  async function removePay(row: PayRow) {
    try {
      await deletePaySynced(row.ids);
      closeAll();
      toast.show('Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await debt.reload();
    } catch (e) {
      toast.show(describeDebtError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  function changeSegment(next: PaySegment) {
    setOpenId(null);
    closeAll();
    setSegment(next);
  }

  function addExpense() {
    router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(period), d: suggestedDateFor(period, today) } });
  }

  function addTransfer() {
    router.push('/cong-no/ghi-nhan');
  }

  const loadingList = isExpense ? !loaded : !debt.loaded;
  const listError = isExpense ? expenseMessage : debt.error;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <PeriodBar title="Chi tiêu" view={view} onChange={setView} today={today} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}
        onScrollBeginDrag={() => {
          setOpenId(null);
          closeAll();
        }}
        keyboardShouldPersistTaps="handled">
        {/* Thẻ tổng quan: số tiền là thông tin nổi bật nhất; chỉ tính khoản chi cá nhân của kỳ. */}
        <View
          style={[styles.hero, { backgroundColor: colors.heroBg }]}
          accessible
          accessibilityLabel={`Tổng chi tiêu ${periodTitle(period)}: ${formatVnd(total)}`}>
          <AppText weight="medium" color={colors.heroSoft} style={styles.heroLabel}>
            {loaded ? 'Tổng chi tiêu' : 'Đang mở sổ…'}
          </AppText>
          <AppText weight="display" color={colors.heroInk} style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
            {formatGrouped(total)}
            <AppText weight="display" color={colors.heroInk} style={styles.heroCurrency}>
              {' '}
              ₫
            </AppText>
          </AppText>
          <AppText color={colors.heroSoft} style={styles.heroCaption} numberOfLines={1}>
            {periodTitle(period)}
            {loaded ? ` · ${items.length} khoản chi` : ''}
            {debt.loaded && !debt.error ? ` · ${history.count} giao dịch` : ''}
          </AppText>
        </View>

        <SegmentedControl options={SEGMENTS} value={segment} onChange={changeSegment} />

        {/* Hàng nút lọc cuộn ngang: danh mục cá nhân (mục Chi tiêu) hoặc loại giao dịch (mục Giao dịch). */}
        {!listError && !loadingList && (
          <View style={styles.chips}>
            {isExpense ? (
              <ChipRow
                options={catOptions}
                value={activeCat}
                onChange={(next) => {
                  setOpenId(null);
                  setCatChip(next);
                }}
              />
            ) : (
              <ChipRow
                options={payOptions}
                value={activePay}
                onChange={(next) => {
                  closeAll();
                  setPayChip(next);
                }}
              />
            )}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.surface, minHeight: Math.max(0, height - 460) }]}>
          {listError ? (
            <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
              <AppText color={colors.danger} style={styles.noticeText}>
                {listError}
              </AppText>
            </View>
          ) : loadingList ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : (
            <>
              <View style={styles.listHead}>
                <View style={styles.flex}>
                  <AppText weight="semibold" style={styles.listTitle} numberOfLines={1}>
                    {isExpense ? `${visibleCount} khoản chi` : `${payCount} giao dịch`}
                  </AppText>
                  {isExpense && (
                    <AppText color={colors.muted} style={styles.listSub} numberOfLines={1}>
                      {formatVnd(visibleTotal)}
                    </AppText>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={isExpense ? addExpense : addTransfer}
                  style={[styles.addButton, { backgroundColor: colors.primarySoft }]}>
                  <AppText weight="semibold" color={colors.primary} style={styles.addText}>
                    {isExpense ? '+ Thêm khoản chi' : '+ Ghi nhận'}
                  </AppText>
                </Pressable>
              </View>

              {isExpense ? (
                groups.length === 0 ? (
                  items.length === 0 ? (
                    <EmptyState
                      text="Chưa có khoản chi nào trong kỳ này. Mỗi khoản bạn ghi sẽ hiện ở đây, xếp theo ngày."
                      icon="check"
                      action={{ label: 'Thêm khoản chi', onPress: addExpense }}
                    />
                  ) : (
                    <EmptyState text="Không có khoản chi nào thuộc danh mục này trong kỳ" icon="check" />
                  )
                ) : (
                  groups.map((group) => (
                    <View key={group.date} style={styles.day}>
                      <View style={styles.dayHeader}>
                        <AppText color={colors.muted} style={styles.dayName} numberOfLines={1}>
                          <AppText weight="semibold" style={styles.dayName}>
                            {dayHeading(group.date, today)}
                          </AppText>
                          , {formatVnDate(group.date)}
                        </AppText>
                        <AppText color={colors.muted} style={styles.dayName}>
                          {formatVnd(group.total)}
                        </AppText>
                      </View>
                      <View style={styles.rows}>
                        {group.items.map((item) => (
                          <ExpenseRow
                            key={item.id}
                            item={item}
                            settings={settings}
                            period={period}
                            open={openId === item.id}
                            onOpen={() => setOpenId(item.id)}
                            onClose={() => setOpenId((current) => (current === item.id ? null : current))}
                            onPressRow={() => {
                              setOpenId(null);
                              openDetail(item);
                            }}
                            onPressLocked={() => openDetail(item)}
                            onEdit={() => edit(item)}
                            onDelete={() => void remove(item)}
                            badge={expenseLinkLabel(item) ?? undefined}
                          />
                        ))}
                      </View>
                    </View>
                  ))
                )
              ) : payDays.length === 0 ? (
                history.count === 0 ? (
                  <EmptyState text="Chưa có giao dịch nào trong kỳ này" icon="check" action={{ label: 'Ghi nhận chuyển tiền', onPress: addTransfer }} />
                ) : (
                  <EmptyState text="Không có giao dịch nào thuộc loại này trong kỳ" icon="check" />
                )
              ) : (
                payDays.map((day) => (
                  <View key={day.date} style={styles.day}>
                    <View style={styles.dayHeader}>
                      <AppText color={colors.muted} style={styles.dayName} numberOfLines={1}>
                        <AppText weight="semibold" style={styles.dayName}>
                          {dayHeading(day.date, today)}
                        </AppText>
                        , {formatVnDate(day.date)}
                      </AppText>
                      <AppText color={colors.muted} style={styles.dayName}>
                        {day.rows.length} giao dịch
                      </AppText>
                    </View>
                    <View style={styles.rows}>
                      {day.rows.map((row) => (
                        <PayRowView
                          key={row.ids.join(',')}
                          row={row}
                          rowProps={rowProps(row.ids.join(','))}
                          onDelete={() => void removePay(row)}
                          badge={payLinkLabel(row) ?? undefined}
                        />
                      ))}
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  hero: { borderRadius: 22, paddingVertical: 18, paddingHorizontal: 20, gap: 2 },
  heroLabel: { fontSize: 13 },
  heroAmount: { fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
  heroCurrency: { fontSize: 20 },
  heroCaption: { fontSize: 13, marginTop: 2 },
  /** Hàng chip tràn hết bề rộng màn hình (bù đệm ngang của nội dung). */
  chips: { marginHorizontal: -16 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden', paddingBottom: 12 },
  loading: { marginTop: 48 },
  notice: { margin: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  listTitle: { fontSize: 15, lineHeight: 20 },
  listSub: { fontSize: 12, lineHeight: 16 },
  addButton: { height: 34, paddingHorizontal: 12, borderRadius: AppRadius.pill, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 13 },
  day: { gap: 10, paddingHorizontal: 12, paddingTop: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 8 },
});
