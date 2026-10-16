import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/design';
import { CategoryIcon } from '@/components/category-icon';
import { SwipeRow } from '@/components/swipe-row';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteExpense } from '@/data/expenseRepository';
import {
  categoriesInUse,
  dayHeading,
  filterByCategory,
  groupByDay,
  periodFromParams,
  periodTitle,
  periodToParams,
  resolveCategory,
  sumAmounts,
} from '@/domain/expenses';
import { linkedExpenseNotice } from '@/domain/linkedExpense';
import { describeStorageError, useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { ExpenseSettings, ExpenseWithId, Period } from '@/types/expense';
import { formatVnDate, monthOf, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Lịch sử chi tiêu cá nhân của một kỳ — một thẻ gồm tóm tắt, chip lọc theo mục và các ngày;
 * mỗi khoản là một khung riêng, vuốt sang trái để Sửa / Xoá (chạm vào dòng không mở trang sửa, như PWA).
 * Tham số route: kỳ (`mode`, `month`, `year`, `from`, `to`) và `cat` (chỉ xem một mục, như bấm mục ở Tổng quan).
 */
export default function HistoryScreen() {
  const params = useLocalSearchParams<{ mode?: string; month?: string; year?: string; from?: string; to?: string; cat?: string }>();
  const { mode, month, year, from, to } = params;
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const toast = useToast();
  const period = useMemo(() => periodFromParams({ mode, month, year, from, to }, today), [mode, month, year, from, to, today]);

  const { settings, error: settingsError } = useExpenseSettings();
  const { items, loaded, error, reload } = useExpenses(period);
  const [chip, setChip] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const fixedCategory = params.cat || null;
  const selected = fixedCategory ?? chip;
  const inUse = useMemo(() => categoriesInUse(items, settings), [items, settings]);
  // Chip đang chọn mà không còn khoản nào (vừa xoá hết) thì quay về "Tất cả", như PWA.
  const activeChip = selected === 'all' || fixedCategory || inUse.some((cat) => cat.id === selected) ? selected : 'all';
  const visible = useMemo(() => filterByCategory(items, settings, activeChip), [items, settings, activeChip]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  const title = fixedCategory ? resolveCategory(settings, fixedCategory).name : 'Chi tiêu cá nhân';
  const message = settingsError ?? error;

  async function remove(item: ExpenseWithId) {
    const notice = linkedExpenseNotice(item);
    if (notice) {
      setOpenId(null);
      toast.show(notice, { bottom: TOAST_BOTTOM_HISTORY });
      return;
    }
    try {
      await deleteExpense({ m: monthOf(item.d), id: item.id });
      setOpenId(null);
      toast.show('Đã xoá khoản chi', { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeStorageError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  function edit(item: ExpenseWithId) {
    const notice = linkedExpenseNotice(item);
    if (notice) {
      toast.show(notice, { bottom: TOAST_BOTTOM_HISTORY });
      return;
    }
    router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(period), m: monthOf(item.d), id: item.id } });
  }

  // Trang riêng: không header, đệm trên 12 + vùng an toàn; một thẻ trắng bo 16 chứa mọi thứ.
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title, headerShown: false }} />
      {message ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {message}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
          onScrollBeginDrag={() => setOpenId(null)}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line, minHeight: Math.max(0, height - 300) }]}>
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <AppText weight="semibold" style={styles.summaryTitle} numberOfLines={1}>
                  {title}
                </AppText>
                <AppText weight="medium" color={colors.muted} style={styles.summaryPeriod}>
                  {periodTitle(period)}
                </AppText>
              </View>
              <View style={styles.summaryRight}>
                <AppText weight="semibold" color={colors.muted} style={styles.summaryCount}>
                  {visible.length} khoản
                </AppText>
                <AppText weight="medium" color={colors.muted} style={styles.summaryAmount}>
                  {formatVnd(sumAmounts(visible))}
                </AppText>
              </View>
            </View>

            <View style={styles.body}>
              {groups.length === 0 ? (
                <EmptyState text="Chưa có khoản chi nào trong kỳ này. Mỗi khoản bạn ghi sẽ hiện ở đây, xếp theo ngày; thêm khoản chi bằng nút + Chi tiêu." icon="check" />
              ) : (
                <>
                  {!fixedCategory && inUse.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.chipsScroll}
                      contentContainerStyle={styles.chips}>
                      <Chip label="Tất cả" selected={activeChip === 'all'} onPress={() => { setOpenId(null); setChip('all'); }} />
                      {inUse.map((cat) => (
                        <Chip
                          key={cat.id}
                          label={cat.name}
                          selected={activeChip === cat.id}
                          onPress={() => {
                            setOpenId(null);
                            setChip(cat.id);
                          }}
                        />
                      ))}
                    </ScrollView>
                  )}

                  {groups.map((group) => (
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
                            onPressRow={() => setOpenId(null)}
                            onPressLocked={() => toast.show(linkedExpenseNotice(item) ?? '', { bottom: TOAST_BOTTOM_HISTORY })}
                            onEdit={() => edit(item)}
                            onDelete={() => remove(item)}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      style={[
        styles.chip,
        selected ? { backgroundColor: colors.ink, borderColor: colors.ink } : { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}>
      <AppText weight="medium" color={selected ? colors.bg : colors.ink} style={styles.chipText}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface RowProps {
  item: ExpenseWithId;
  settings: ExpenseSettings;
  period: Period;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPressRow: () => void;
  onPressLocked: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ExpenseRow({ item, settings, open, onOpen, onClose, onPressRow, onPressLocked, onEdit, onDelete }: RowProps) {
  const colors = useColors();
  const category = resolveCategory(settings, item.c);
  return (
    <SwipeRow
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      onEdit={onEdit}
      onDelete={onDelete}
      onPressRow={onPressRow}
      locked={!!linkedExpenseNotice(item)}
      onPressLocked={onPressLocked}
      background={colors.bg}
      radius={AppRadius.field}
      accessibilityLabel={`${item.n || category.name}, ${formatVnd(item.a)}`}>
      <View style={styles.row}>
        <CategoryIcon category={category} />
        <View style={styles.rowText}>
          <AppText weight="semibold" style={styles.rowTitle} numberOfLines={2}>
            {item.n || category.name}
          </AppText>
          <AppText color={colors.muted} style={styles.rowSub} numberOfLines={3}>
            {item.i || category.name}
          </AppText>
        </View>
        <AppText weight="bold" style={styles.rowAmount}>
          {formatVnd(item.a)}
        </AppText>
      </View>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, borderWidth: 1, overflow: 'hidden' },
  /** Tóm tắt: cao 64, đệm 10/14 (đo từ PWA). */
  summary: { minHeight: 64, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryLeft: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 16, lineHeight: 22 },
  summaryPeriod: { fontSize: 12, lineHeight: 15 },
  summaryRight: { alignItems: 'flex-end' },
  summaryCount: { fontSize: 14, lineHeight: 19.5 },
  summaryAmount: { fontSize: 12, lineHeight: 15 },
  /** Thân thẻ: đệm 2/12/12, các khối cách nhau 12. Chip tràn hết bề rộng thẻ. */
  body: { paddingTop: 2, paddingBottom: 12, gap: 12 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 12, paddingBottom: 4.8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: AppRadius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13 },
  day: { gap: 12, paddingHorizontal: 12 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  /** Khung chứa các dòng có viền trong suốt 0.8px như PWA (.panel.rows). */
  rows: { gap: 8, borderWidth: 0.8, borderColor: 'transparent' },
  row: { minHeight: 64, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15.5, lineHeight: 19.4 },
  rowSub: { fontSize: 12, lineHeight: 15.6 },
  rowAmount: { fontSize: 16, lineHeight: 23 },
  /** Trạng thái rỗng: đệm 28/16, giữa, tiêu đề Bricolage 17, chữ 15 (đo từ PWA). */
  empty: { paddingVertical: 28, paddingHorizontal: 28, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 17, lineHeight: 25, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 21.75, textAlign: 'center' },
});
