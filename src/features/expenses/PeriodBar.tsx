import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { canGoNext, monthHeading, normalizeCustomRange, periodOf, type PeriodView } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';
import type { DateStr, Period } from '@/types/expense';
import { addMonths, isValidDateStr } from '@/utils/date';

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

/**
 * Ô chọn thời gian xem của Tổng quan (`#periodBar`): nền trang, đệm 8 trên/dưới, cao 110 với
 * thanh phân đoạn 42 + khoảng 10 + hàng 42. Được đặt làm phần tử dính ở đầu trang cuộn.
 */
export function PeriodBar({ view, onChange, today }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const period = periodOf(view);
  const next = canGoNext(period, today);

  function shift(delta: number) {
    if (view.mode === 'month') onChange({ ...view, month: addMonths(view.month, delta) });
    else if (view.mode === 'year') onChange({ ...view, year: view.year + delta });
  }

  function applyRange(from: DateStr, to: DateStr) {
    if (!isValidDateStr(from) || !isValidDateStr(to)) return;
    const range = normalizeCustomRange(from, to, today);
    onChange({ ...view, from: range.from, to: range.to });
    if (range.clamped) toast.show('Xem tối đa 5 năm một lần');
  }

  const pill = [styles.pillRow, { backgroundColor: colors.surface, borderColor: colors.line }];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg, paddingTop: 8 + insets.top }]}>
      <View style={[styles.segment, { backgroundColor: colors.surface2 }]} accessibilityRole="tablist">
        {MODES.map((item) => {
          const selected = item.mode === view.mode;
          return (
            <Pressable
              key={item.mode}
              style={[styles.segmentItem, selected && [styles.segmentItemOn, { backgroundColor: colors.surface }]]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange({ ...view, mode: item.mode })}>
              <AppText weight="semibold" color={selected ? colors.ink : colors.muted} style={styles.segmentText}>
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row}>
        {(view.mode === 'month' || view.mode === 'year') && (
          <View style={pill}>
            <Pressable style={styles.arrow} accessibilityLabel="Kỳ trước" onPress={() => shift(-1)}>
              <SvgIcon name="chevronLeft" size={18} color={colors.muted} strokeWidth={2.2} />
            </Pressable>
            <AppText weight="semibold" style={styles.label}>
              {view.mode === 'month' ? monthHeading(view.month) : `Năm ${view.year}`}
            </AppText>
            <Pressable style={[styles.arrow, !next && styles.arrowOff]} accessibilityLabel="Kỳ sau" disabled={!next} onPress={() => shift(1)}>
              <SvgIcon name="chevronRight" size={18} color={colors.muted} strokeWidth={2.2} />
            </Pressable>
          </View>
        )}

        {view.mode === 'all' && (
          <View style={[...pill, styles.center]}>
            <AppText weight="semibold" style={styles.label}>
              Từ trước đến nay
            </AppText>
          </View>
        )}

        {view.mode === 'custom' && (
          <View style={styles.range}>
            <View style={styles.rangeCol}>
              <DateField pill value={view.from} accessibilityLabel="Từ ngày" onPress={() => setPicking('from')} />
            </View>
            <AppText color={colors.muted} style={styles.arrowText}>
              →
            </AppText>
            <View style={styles.rangeCol}>
              <DateField pill value={view.to} accessibilityLabel="Đến ngày" onPress={() => setPicking('to')} />
            </View>
          </View>
        )}
      </View>

      {picking && (
        <CalendarPanel
          variant="popup"
          value={picking === 'from' ? view.from : view.to}
          today={today}
          max={today}
          onCancel={() => setPicking(null)}
          onConfirm={(date) => {
            setPicking(null);
            if (picking === 'from') applyRange(date, view.to);
            else applyRange(view.from, date);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 8, gap: 10 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: AppRadius.segment },
  segmentItem: { flex: 1, height: 36, borderRadius: AppRadius.segmentItem, alignItems: 'center', justifyContent: 'center' },
  segmentItemOn: { shadowColor: '#12211D', shadowOpacity: 0.12, shadowRadius: 1.5, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 13 },
  row: { height: 42 },
  pillRow: {
    height: 42,
    borderRadius: AppRadius.pill,
    borderWidth: 1,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
  },
  center: { justifyContent: 'center' },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { opacity: 0.3 },
  label: { fontSize: 14 },
  range: { flexDirection: 'row', alignItems: 'center' },
  rangeCol: { flex: 1 },
  arrowText: { width: 24, textAlign: 'center', fontSize: 16 },
});
