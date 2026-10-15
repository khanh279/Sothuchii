import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { PwaColors } from '@/constants/theme';
import {
  categoriesInUse,
  dayHeading,
  filterByCategory,
  groupByDay,
  periodFromParams,
  periodPhrase,
  resolveCategory,
  sumAmounts,
} from '@/domain/expenses';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import type { ExpenseSettings, ExpenseWithId } from '@/types/expense';
import { formatVnDate, monthOf, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Lịch sử chi tiêu cá nhân của một kỳ.
 * Tham số route: kỳ (`mode`, `month`, `year`, `from`, `to`) và `cat` (chỉ xem một mục, như bấm mục ở Tổng quan).
 */
export default function HistoryScreen() {
  const params = useLocalSearchParams<{ mode?: string; month?: string; year?: string; from?: string; to?: string; cat?: string }>();
  const { mode, month, year, from, to } = params;
  const today = todayStr();
  const period = useMemo(() => periodFromParams({ mode, month, year, from, to }, today), [mode, month, year, from, to, today]);

  const { settings, error: settingsError } = useExpenseSettings();
  const { items, loaded, error } = useExpenses(period);
  const [chip, setChip] = useState<string>('all');

  const fixedCategory = params.cat || null;
  const selected = fixedCategory ?? chip;
  const inUse = useMemo(() => categoriesInUse(items, settings), [items, settings]);
  // Chip đang chọn mà không còn khoản nào (vừa xoá hết) thì quay về "Tất cả", như PWA.
  const activeChip = selected === 'all' || fixedCategory || inUse.some((cat) => cat.id === selected) ? selected : 'all';
  const visible = useMemo(() => filterByCategory(items, settings, activeChip), [items, settings, activeChip]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  const title = fixedCategory ? resolveCategory(settings, fixedCategory).name : 'Chi tiêu cá nhân';
  const message = settingsError ?? error;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />
      {message ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{message}</Text>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={PwaColors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summary}>
            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle}>{title}</Text>
              <Text style={styles.summarySub}>{periodPhrase(period)}</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryCount}>{visible.length} khoản</Text>
              <Text style={styles.summaryTotal}>{formatVnd(sumAmounts(visible))}</Text>
            </View>
          </View>

          {!fixedCategory && inUse.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="Tất cả" selected={activeChip === 'all'} onPress={() => setChip('all')} />
              {inUse.map((cat) => (
                <Chip key={cat.id} label={cat.name} selected={activeChip === cat.id} onPress={() => setChip(cat.id)} />
              ))}
            </ScrollView>
          )}

          {groups.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Chưa có khoản chi nào trong kỳ này</Text>
              <Text style={styles.emptyText}>Mỗi khoản bạn ghi sẽ hiện ở đây, xếp theo ngày.</Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.date} style={styles.day}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName} numberOfLines={1}>
                    <Text style={styles.dayBold}>{dayHeading(group.date, today)}</Text>, {formatVnDate(group.date)}
                  </Text>
                  <Text style={styles.dayTotal}>{formatVnd(group.total)}</Text>
                </View>
                <View style={styles.card}>
                  {group.items.map((item, index) => (
                    <ExpenseRow key={item.id} item={item} settings={settings} last={index === group.items.length - 1} />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ExpenseRow({ item, settings, last }: { item: ExpenseWithId; settings: ExpenseSettings; last: boolean }) {
  const category = resolveCategory(settings, item.c);
  return (
    <Pressable
      style={[styles.row, !last && styles.rowBorder]}
      accessibilityRole="button"
      accessibilityLabel={`${item.n || category.name}, ${formatVnd(item.a)}`}
      onPress={() => router.push({ pathname: '/chi-tieu/nhap', params: { m: monthOf(item.d), id: item.id } })}>
      <CategoryIcon category={category} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.n || category.name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={2}>
          {item.i || category.name}
        </Text>
      </View>
      <Text style={styles.rowAmount}>{formatVnd(item.a)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PwaColors.bg },
  content: { padding: 16, gap: 16 },
  loading: { marginTop: 48 },
  notice: { margin: 16, padding: 16, borderRadius: 16, backgroundColor: PwaColors.dangerSoft },
  noticeText: { color: PwaColors.danger, fontSize: 15 },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: PwaColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PwaColors.line,
    padding: 16,
    gap: 12,
  },
  summaryText: { flex: 1 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: PwaColors.ink },
  summarySub: { fontSize: 13, color: PwaColors.muted, marginTop: 2 },
  summaryRight: { alignItems: 'flex-end' },
  summaryCount: { fontSize: 13, color: PwaColors.muted },
  summaryTotal: { fontSize: 17, fontWeight: '700', color: PwaColors.ink, marginTop: 2 },
  chips: { gap: 8, paddingRight: 16 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PwaColors.line,
    backgroundColor: PwaColors.surface,
  },
  chipSelected: { backgroundColor: PwaColors.primary, borderColor: PwaColors.primary },
  chipText: { fontSize: 13, fontWeight: '500', color: PwaColors.ink },
  chipTextSelected: { color: PwaColors.primaryInk },
  empty: {
    backgroundColor: PwaColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PwaColors.line,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: PwaColors.ink, textAlign: 'center' },
  emptyText: { fontSize: 13, color: PwaColors.muted, textAlign: 'center' },
  day: { gap: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 4 },
  dayName: { flex: 1, fontSize: 13, color: PwaColors.muted },
  dayBold: { fontWeight: '600', color: PwaColors.ink },
  dayTotal: { fontSize: 13, color: PwaColors.muted },
  card: {
    backgroundColor: PwaColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PwaColors.line,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: PwaColors.line },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: PwaColors.ink },
  rowSub: { fontSize: 13, color: PwaColors.muted, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '600', color: PwaColors.ink },
});
