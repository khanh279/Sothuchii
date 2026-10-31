import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CardHead } from '@/components/design';
import { PeriodNote } from '@/components/period-filter';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { todayStr } from '@/utils/date';
import { AppRadius } from '@/constants/palette';
import { buildSpendSeries, type SpendBucket, type SpendSeries, type SpendUnit } from '@/domain/spendSeries';
import { useColors } from '@/hooks/use-colors';
import type { Expense, Period } from '@/types/expense';
import { formatVnd, formatVndCompact } from '@/utils/format';

/** Cao vùng cột (không gồm nhãn trục). */
const CHART_HEIGHT = 110;
/** Cột có chi tiêu luôn cao ít nhất chừng này để thấy được. */
const MIN_BAR = 4;
/** Có ít cột (khoảng ngắn) thì mỗi cột chỉ rộng chừng này và cả biểu đồ căn giữa, không giãn hết thẻ. */
const SPARSE_MAX = 7;
const SPARSE_COLUMN = 48;

interface Props {
  items: readonly Pick<Expense, 'a' | 'd'>[];
  period: Period;
}

const TITLE: Record<SpendUnit, string> = { day: 'Chi theo ngày', week: 'Chi theo tuần', month: 'Chi theo tháng', year: 'Chi theo năm' };

/** "12/10" từ `YYYY-MM-DD`. */
function dayMonth(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(day)}/${Number(month)}`;
}

const yearOf = (date: string): string => date.slice(0, 4);
const monthOf = (date: string): number => Number(date.slice(5, 7));

/** Các cột nằm trong nhiều năm / nhiều tháng khác nhau không (để nhãn có thêm năm / tháng cho khỏi nhầm). */
function spans(series: SpendSeries): { years: boolean; months: boolean } {
  const first = series.buckets[0].start;
  const last = series.buckets[series.buckets.length - 1].end;
  return { years: yearOf(first) !== yearOf(last), months: first.slice(0, 7) !== last.slice(0, 7) };
}

/** Nhãn đầy đủ của một cột (dòng trên biểu đồ): "Ngày 12/10", "Tuần 6/10 – 12/10", "Tháng 3", "Năm 2025"… */
function bucketLabel(series: SpendSeries, bucket: SpendBucket): string {
  const { years } = spans(series);
  switch (series.unit) {
    case 'day':
      return `Ngày ${dayMonth(bucket.start)}${years ? `/${yearOf(bucket.start)}` : ''}`;
    case 'week':
      return `Tuần ${dayMonth(bucket.start)} – ${dayMonth(bucket.end)}`;
    case 'month':
      return years ? `Tháng ${monthOf(bucket.start)}/${yearOf(bucket.start)}` : `Tháng ${monthOf(bucket.start)}`;
    case 'year':
      return `Năm ${yearOf(bucket.start)}`;
  }
}

/** Nhãn ngắn dưới trục: ngày trong tháng (hoặc "12/10" khi ít cột / vắt qua tháng), "6/10" theo tuần, số tháng (thêm "/25" khi qua năm), năm. */
function axisText(series: SpendSeries, bucket: SpendBucket): string {
  const { years, months } = spans(series);
  switch (series.unit) {
    case 'day':
      return series.buckets.length <= SPARSE_MAX || months ? dayMonth(bucket.start) : String(Number(bucket.start.slice(8, 10)));
    case 'week':
      return dayMonth(bucket.start);
    case 'month':
      return years ? `${monthOf(bucket.start)}/${yearOf(bucket.start).slice(2)}` : String(monthOf(bucket.start));
    case 'year':
      return yearOf(bucket.start);
  }
}

/** Nhãn trục chỉ hiện ở một số cột để không chen nhau: ít cột thì hiện hết; theo ngày hiện ngày 1, 5, 10, … và cột cuối; các mức khác thưa đều theo số cột. */
function showAxisLabel(series: SpendSeries, bucket: SpendBucket): boolean {
  const count = series.buckets.length;
  if (count <= SPARSE_MAX) return true;
  const { index } = bucket;
  if (series.unit === 'day') return index === 1 || index === count || (Number(bucket.start.slice(8, 10)) % 5 === 0 && count - index >= 3);
  if (series.unit === 'month' && !spans(series).years && count <= 12) return true;
  return (index - 1) % Math.ceil(count / 8) === 0;
}

/**
 * Thẻ biểu đồ cột chi tiêu cá nhân (`buildSpendSeries`, không tính lại ở đây): mức gom tự chọn theo kỳ (tháng: ngày; năm: tháng; tuỳ chọn / tất cả: ngày, tuần, tháng hoặc năm
 * theo độ dài). Chạm một cột để xem số tiền của khoảng đó (chạm lại để bỏ chọn); chưa chọn thì dòng trên biểu đồ ghi cột cao nhất. Không có khoản chi, hoặc chỉ một cột
 * thì không hiện thẻ, như thẻ biểu đồ tròn bên cạnh. Ít cột (khoảng ngắn) thì cột có bề rộng cố định và căn giữa.
 */
export function ExpenseTrendCard({ items, period }: Props) {
  const { view, setView } = useSharedPeriod();
  const colors = useColors();
  const series = useMemo(() => buildSpendSeries(items, period), [items, period]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (!series || series.total <= 0) return null;

  const selected = series.buckets.find((bucket) => bucket.key === selectedKey) ?? null;
  const shown = selected ?? series.peak;
  const count = series.buckets.length;
  const sparse = count <= SPARSE_MAX;
  const gap = sparse ? 6 : series.unit === 'day' ? 1 : series.unit === 'week' ? 2 : count <= 12 ? 4 : 2;
  const columnStyle = sparse ? { width: SPARSE_COLUMN } : styles.columnFlex;
  const rowAlign = sparse ? styles.rowCenter : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <CardHead title={TITLE[series.unit]} subtitleNode={<PeriodNote view={view} onChange={setView} today={todayStr()} />} />

      {shown && (
        <View style={styles.info} accessibilityLiveRegion="polite">
          <AppText weight="semibold" color={colors.muted} style={styles.infoText} numberOfLines={1}>
            {selected ? bucketLabel(series, shown) : `Cao nhất · ${bucketLabel(series, shown)}`}
          </AppText>
          <AppText weight="bold" style={styles.infoAmount}>
            {formatVnd(shown.amount)}
          </AppText>
        </View>
      )}

      <View>
        <AppText color={colors.muted} style={styles.axisMax}>
          {formatVndCompact(series.max)}
        </AppText>
        <View style={[styles.bars, rowAlign, { borderBottomColor: colors.line }]}>
          {series.buckets.map((bucket) => {
            const active = selected?.key === bucket.key;
            const height = bucket.amount > 0 ? Math.max(MIN_BAR, (bucket.amount / series.max) * CHART_HEIGHT) : 2;
            return (
              <Pressable
                key={bucket.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${bucketLabel(series, bucket)}, ${formatVnd(bucket.amount)}`}
                onPress={() => setSelectedKey(active ? null : bucket.key)}
                style={[styles.column, columnStyle, { paddingHorizontal: gap }]}>
                <View
                  style={[
                    styles.bar,
                    { height, borderRadius: series.unit === 'day' && !sparse ? 2 : 4 },
                    bucket.amount > 0 ? { backgroundColor: colors.primary, opacity: selected && !active ? 0.3 : 1 } : { backgroundColor: colors.line },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.axis, rowAlign]}>
          {series.buckets.map((bucket) => (
            <View key={bucket.key} style={[styles.axisCell, columnStyle]}>
              {showAxisLabel(series, bucket) && (
                <AppText color={colors.muted} style={styles.axisLabel}>
                  {axisText(series, bucket)}
                </AppText>
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
  info: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  infoText: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  infoAmount: { fontSize: 15.5, lineHeight: 21 },
  axisMax: { fontSize: 11, lineHeight: 15, marginBottom: 2 },
  bars: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth },
  rowCenter: { justifyContent: 'center' },
  columnFlex: { flex: 1, minWidth: 0 },
  column: { height: CHART_HEIGHT, justifyContent: 'flex-end' },
  bar: { width: '100%' },
  axis: { flexDirection: 'row', marginTop: 4 },
  axisCell: { height: 14 },
  /** Định vị tuyệt đối quanh giữa cột: nhãn rộng hơn cột hẹp vẫn hiện đủ, không bị cắt. */
  axisLabel: { position: 'absolute', left: '50%', marginLeft: -20, width: 40, textAlign: 'center', fontSize: 10.5, lineHeight: 14 },
});
