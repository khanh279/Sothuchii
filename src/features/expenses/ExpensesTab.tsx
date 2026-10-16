import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ChipRow, EmptyState, ScreenTitle } from '@/components/design';
import { AppRadius } from '@/constants/palette';
import { categoriesInUse, dayHeading, filterByCategory, groupByDay, periodTitle, periodToParams, suggestedDateFor, sumAmounts } from '@/domain/expenses';
import { expenseLinkLabel } from '@/domain/expenseTab';
import { ExpenseRow } from '@/features/expenses/HistoryScreen';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { useExpenseRowActions } from '@/features/expenses/useExpenseRowActions';
import { useColors } from '@/hooks/use-colors';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatGrouped, formatVnd } from '@/utils/format';

/**
 * Tab "Chi tiêu": thẻ tổng chi tiêu của kỳ, hàng nút lọc danh mục cuộn ngang và danh sách khoản chi cá nhân (kể cả khoản tự sinh từ chia bill /
 * quỹ, vẫn bị khoá sửa/xoá). Kỳ lấy từ bộ lọc DÙNG CHUNG chọn ở Tổng quan (không có ô chọn ngày riêng). Chip danh mục được nhớ khi đổi tab.
 * Lịch sử giao dịch / chuyển tiền nằm ở tab Công nợ.
 */
export default function ExpensesTab() {
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { period } = useSharedPeriod();
  const [catChip, setCatChip] = usePersistedState<string>('tab:chi-tieu:chip', () => 'all');

  const { settings, error: settingsError } = useExpenseSettings();
  const { items, loaded, error, reload } = useExpenses(period);
  const { openId, setOpenId, remove, edit, openDetail } = useExpenseRowActions({ period, reload });

  const total = useMemo(() => sumAmounts(items), [items]);
  const inUse = useMemo(() => categoriesInUse(items, settings), [items, settings]);
  // Chip đang chọn mà không còn khoản nào trong kỳ này thì quay về "Tất cả" (không đổi giá trị đã nhớ).
  const activeCat = catChip === 'all' || inUse.some((cat) => cat.id === catChip) ? catChip : 'all';
  const groups = useMemo(() => groupByDay(filterByCategory(items, settings, activeCat)), [items, settings, activeCat]);
  const visibleCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const visibleTotal = groups.reduce((sum, group) => sum + group.total, 0);
  const catOptions = useMemo(() => [{ value: 'all', label: 'Tất cả' }, ...inUse.map((cat) => ({ value: cat.id, label: cat.name }))], [inUse]);
  const message = settingsError ?? error;

  function addExpense() {
    router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(period), d: suggestedDateFor(period, today) } });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScreenTitle title="Chi tiêu" topInset={insets.top} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]} onScrollBeginDrag={() => setOpenId(null)} keyboardShouldPersistTaps="handled">
        {/* Thẻ tổng quan: số tiền là thông tin nổi bật nhất; chỉ tính khoản chi cá nhân của kỳ. */}
        <View style={[styles.hero, { backgroundColor: colors.heroBg }]} accessible accessibilityLabel={`Tổng chi tiêu ${periodTitle(period)}: ${formatVnd(total)}`}>
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
          </AppText>
        </View>

        {/* Hàng nút lọc danh mục cuộn ngang. */}
        {!message && loaded && (
          <View style={styles.chips}>
            <ChipRow
              options={catOptions}
              value={activeCat}
              onChange={(next) => {
                setOpenId(null);
                setCatChip(next);
              }}
            />
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.surface, minHeight: Math.max(0, height - 400) }]}>
          {message ? (
            <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
              <AppText color={colors.danger} style={styles.noticeText}>
                {message}
              </AppText>
            </View>
          ) : !loaded ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : (
            <>
              <View style={styles.listHead}>
                <View style={styles.flex}>
                  <AppText weight="semibold" style={styles.listTitle} numberOfLines={1}>
                    {visibleCount} khoản chi
                  </AppText>
                  <AppText color={colors.muted} style={styles.listSub} numberOfLines={1}>
                    {formatVnd(visibleTotal)}
                  </AppText>
                </View>
                <Pressable accessibilityRole="button" onPress={addExpense} style={[styles.addButton, { backgroundColor: colors.primarySoft }]}>
                  <AppText weight="semibold" color={colors.primary} style={styles.addText}>
                    + Thêm khoản chi
                  </AppText>
                </Pressable>
              </View>

              {groups.length === 0 ? (
                items.length === 0 ? (
                  <EmptyState text="Chưa có khoản chi nào trong kỳ này. Mỗi khoản bạn ghi sẽ hiện ở đây, xếp theo ngày." icon="check" action={{ label: 'Thêm khoản chi', onPress: addExpense }} />
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
