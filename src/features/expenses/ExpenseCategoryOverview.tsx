import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { CardHead } from '@/components/design';
import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import { categoryPercent, donutSegments, periodTitle, summarizeByCategory } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';
import type { Expense, ExpenseSettings, Period } from '@/types/expense';
import { formatVnd, formatVndCompact } from '@/utils/format';

const RADIUS = 40;
const STROKE = 15;
const SIZE = 148;

interface Props {
  items: readonly Pick<Expense, 'a' | 'c'>[];
  settings: ExpenseSettings;
  period: Period;
  /** Mục đang lọc ở lịch sử bên dưới ('all' = không lọc), để tô sáng dòng tương ứng. */
  activeCategory: string;
  /** Chạm một mục để lọc lịch sử theo mục đó (chạm lại để bỏ lọc). */
  onSelectCategory: (categoryId: string) => void;
}

/**
 * Thẻ tổng quan chi tiêu cá nhân: biểu đồ tròn cho thấy chi tiêu đang đi vào những mục nào, ở giữa là tổng chi của kỳ, bên cạnh/dưới là danh sách từng mục
 * với màu, số tiền và TỶ LỆ % trên tổng (đã có sẵn `summarizeByCategory` / `donutSegments`, không tính lại ở đây). Chỉ hiện mục có chi tiêu; không có
 * khoản chi nào trong kỳ thì không hiện thẻ.
 */
export function ExpenseCategoryOverview({ items, settings, period, activeCategory, onSelectCategory }: Props) {
  const colors = useColors();
  const { summaries, total } = useMemo(() => {
    const all = summarizeByCategory(items, settings).filter((s) => s.sum > 0);
    return { summaries: all, total: all.reduce((sum, s) => sum + s.sum, 0) };
  }, [items, settings]);
  const segments = useMemo(() => donutSegments(summaries, total, RADIUS), [summaries, total]);

  if (total <= 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <CardHead title="Tổng quan" subtitle={periodTitle(period)} rightTop={`${summaries.length} mục`} rightBottom={formatVnd(total)} />

      <View style={styles.chartWrap} accessible accessibilityLabel={`Tổng chi ${formatVnd(total)}. ${summaries.map((s) => `${s.category.name} ${categoryPercent(s.sum, total)}%`).join(', ')}`}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={RADIUS} fill="none" stroke={colors.line} strokeWidth={STROKE} />
          {segments.map((segment, index) => (
            <Circle
              key={index}
              cx={50}
              cy={50}
              r={RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth={STROKE}
              strokeDasharray={`${segment.dash} ${segment.gap}`}
              strokeDashoffset={segment.offset}
              transform="rotate(-90 50 50)"
            />
          ))}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <AppText color={colors.muted} style={styles.centerLabel}>
            Tổng chi
          </AppText>
          <AppText weight="display" style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatVndCompact(total)}
          </AppText>
        </View>
      </View>

      <View style={styles.legend}>
        {summaries.map((item) => {
          const selected = activeCategory === item.category.id;
          const percent = categoryPercent(item.sum, total);
          return (
            <Pressable
              key={item.category.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${item.category.name}, ${formatVnd(item.sum)}, ${percent}%`}
              onPress={() => onSelectCategory(item.category.id)}
              style={[styles.row, selected && { backgroundColor: colors.primarySoft }]}>
              <View style={[styles.dot, { backgroundColor: item.category.color }]} />
              <AppText weight="semibold" style={styles.name} numberOfLines={1}>
                {item.category.name}
              </AppText>
              <AppText color={colors.muted} style={styles.amount} numberOfLines={1}>
                {formatVnd(item.sum)}
              </AppText>
              <AppText weight="bold" style={styles.percent}>
                {String(percent).replace('.', ',')}%
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
  chartWrap: { alignSelf: 'center', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: SIZE * 0.5 },
  centerLabel: { fontSize: 11.5, lineHeight: 15 },
  centerValue: { fontSize: 20, lineHeight: 26 },
  legend: { gap: 2 },
  row: { minHeight: 40, borderRadius: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, minWidth: 0, fontSize: 14 },
  amount: { fontSize: 13 },
  percent: { width: 52, textAlign: 'right', fontSize: 14 },
});
