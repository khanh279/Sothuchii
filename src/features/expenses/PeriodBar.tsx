import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { PwaColors } from '@/constants/theme';
import { canGoNext, monthHeading, normalizeCustomRange, periodOf, type PeriodView } from '@/domain/expenses';
import type { DateStr, Period } from '@/types/expense';
import { addMonths, isValidDateStr } from '@/utils/date';
import { notify } from '@/utils/dialog';

const MODES: { mode: Period['mode']; label: string }[] = [
  { mode: 'month', label: 'Tháng' },
  { mode: 'year', label: 'Năm' },
  { mode: 'all', label: 'Tất cả' },
  { mode: 'custom', label: 'Tuỳ chọn' },
];

interface Props {
  view: PeriodView;
  onChange: (view: PeriodView) => void;
  today: DateStr;
}

/** Ô chọn thời gian xem: Tháng / Năm / Tất cả / Tuỳ chọn. */
export function PeriodBar({ view, onChange, today }: Props) {
  const period = periodOf(view);

  function shift(delta: number) {
    if (view.mode === 'month') onChange({ ...view, month: addMonths(view.month, delta) });
    else if (view.mode === 'year') onChange({ ...view, year: view.year + delta });
  }

  function applyRange(from: DateStr, to: DateStr) {
    if (!isValidDateStr(from) || !isValidDateStr(to)) return;
    const range = normalizeCustomRange(from, to, today);
    onChange({ ...view, from: range.from, to: range.to });
    if (range.clamped) notify('Xem tối đa 5 năm một lần');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.segment} accessibilityRole="tablist">
        {MODES.map((item) => {
          const selected = item.mode === view.mode;
          return (
            <Pressable
              key={item.mode}
              style={[styles.segmentItem, selected && styles.segmentItemSelected]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange({ ...view, mode: item.mode })}>
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {(view.mode === 'month' || view.mode === 'year') && (
        <View style={styles.nav}>
          <Pressable style={styles.navButton} accessibilityLabel="Kỳ trước" onPress={() => shift(-1)}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Text style={styles.navLabel}>{view.mode === 'month' ? monthHeading(view.month) : `Năm ${view.year}`}</Text>
          <Pressable
            style={[styles.navButton, !canGoNext(period, today) && styles.navDisabled]}
            accessibilityLabel="Kỳ sau"
            disabled={!canGoNext(period, today)}
            onPress={() => shift(1)}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        </View>
      )}

      {view.mode === 'custom' && (
        <View style={styles.range}>
          <View style={styles.rangeCol}>
            <Text style={styles.rangeLabel}>Từ ngày</Text>
            <DateField value={view.from} max={today} onChange={(from) => applyRange(from, view.to)} />
          </View>
          <View style={styles.rangeCol}>
            <Text style={styles.rangeLabel}>Đến ngày</Text>
            <DateField value={view.to} max={today} onChange={(to) => applyRange(view.from, to)} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  segment: {
    flexDirection: 'row',
    backgroundColor: PwaColors.surface2,
    borderRadius: 12,
    padding: 3,
  },
  segmentItem: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segmentItemSelected: { backgroundColor: PwaColors.surface },
  segmentText: { fontSize: 14, fontWeight: '500', color: PwaColors.muted },
  segmentTextSelected: { color: PwaColors.ink, fontWeight: '700' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: {
    width: 44,
    height: 40,
    borderRadius: 12,
    backgroundColor: PwaColors.surface,
    borderWidth: 1,
    borderColor: PwaColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: { opacity: 0.35 },
  navArrow: { fontSize: 22, color: PwaColors.ink, lineHeight: 24 },
  navLabel: { fontSize: 16, fontWeight: '700', color: PwaColors.ink },
  range: { flexDirection: 'row', gap: 12 },
  rangeCol: { flex: 1, gap: 6 },
  rangeLabel: { fontSize: 13, fontWeight: '600', color: PwaColors.muted },
});
