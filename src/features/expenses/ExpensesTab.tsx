import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState, ScreenTitle, TitleAction } from '@/components/design';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { categoriesInUse, dayHeading, filterByCategory, groupByDay, periodTitle, periodToParams, suggestedDateFor } from '@/domain/expenses';
import { expenseLinkLabel } from '@/domain/expenseTab';
import { ExpenseCategoryOverview } from '@/features/expenses/ExpenseCategoryOverview';
import { ExpenseRow } from '@/features/expenses/HistoryScreen';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { useExpenseRowActions } from '@/features/expenses/useExpenseRowActions';
import { useColors } from '@/hooks/use-colors';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Tab "Chi tiêu": hàng nút lọc danh mục cuộn ngang và danh sách khoản chi cá nhân (kể cả khoản tự sinh từ chia bill /
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
      <ScreenTitle title="Chi tiêu" topInset={insets.top} right={<TitleAction label="Chi tiêu" onPress={addExpense} />} />
      <LockableScrollView contentContainerStyle={[styles.content, { paddingBottom: PageLayout.bottomClearance + insets.bottom }]} onScrollBeginDrag={() => setOpenId(null)} keyboardShouldPersistTaps="handled">
        {/* Thẻ tổng quan: biểu đồ tròn phân bổ chi tiêu theo mục (kèm %), nằm trên cùng; chạm một mục để lọc lịch sử bên dưới. */}
        {!message && loaded && (
          <ExpenseCategoryOverview
            items={items}
            settings={settings}
            period={period}
            activeCategory={activeCat}
            onSelectCategory={(id) => {
              setOpenId(null);
              setCatChip(activeCat === id ? 'all' : id);
            }}
          />
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
                <CardHead title="Lịch sử chi tiêu" subtitle={periodTitle(period)} rightTop={`${visibleCount} khoản chi`} rightBottom={formatVnd(visibleTotal)} />
              </View>

              {/* Hàng nút lọc danh mục cuộn ngang, ngay dưới tiêu đề lịch sử. */}
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

              {groups.length === 0 ? (
                items.length === 0 ? (
                  <EmptyState text="Chưa có khoản chi nào trong kỳ này. Mỗi khoản bạn ghi sẽ hiện ở đây, xếp theo ngày." icon="check" />
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
      </LockableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  flex: { flex: 1, minWidth: 0 },
  chips: { paddingBottom: 4 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden', paddingBottom: 12 },
  loading: { marginTop: 48 },
  notice: { margin: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  listHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  day: { gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
