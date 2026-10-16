import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { periodTitle, type BudgetSummary } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { formatGrouped, formatVnd } from '@/utils/format';

interface Props {
  period: Period;
  loaded: boolean;
  total: number;
  /** Số khoản chi và chi trung bình mỗi ngày của kỳ (null: không xác định, ẩn). */
  count: number;
  average: number | null;
  budget: BudgetSummary | null;
  /** Mở Cài đặt (biểu tượng bánh răng ở góc phải thẻ). */
  onSettings: () => void;
}

/**
 * Thẻ "Tổng chi tiêu" nổi bật ở đầu Tổng quan (nền navy, chữ trắng): tổng chi của kỳ đang chọn, số khoản chi, trung bình/ngày và ngân sách
 * nếu có. Thẻ CHỈ để xem (không bấm được); riêng biểu tượng bánh răng ở góc phải mở Cài đặt. Chỉ dùng số liệu chi tiêu cá nhân sẵn có.
 */
export function SpentCard({ period, loaded, total, count, average, budget, onSettings }: Props) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.heroBg }]}>
      <View style={styles.hero} accessible accessibilityLabel={`Tổng chi tiêu ${periodTitle(period)}: ${formatVnd(total)}`}>
        <View style={styles.head}>
          <AppText weight="medium" color={colors.heroSoft} style={styles.label}>
            {loaded ? 'Tổng chi tiêu' : 'Đang mở sổ…'}
          </AppText>
          <AppText weight="display" color={colors.heroInk} style={styles.total} adjustsFontSizeToFit numberOfLines={1}>
            {formatGrouped(total)}
            <AppText weight="display" color={colors.heroInk} style={styles.currency}>
              {' '}
              ₫
            </AppText>
          </AppText>
        </View>

        {/* Số liệu phụ: số khoản chi và trung bình mỗi ngày (không đổi công thức tổng). */}
        <View style={[styles.statsRule, { backgroundColor: colors.heroTrack }]} />
        <View style={styles.row}>
          <View>
            <AppText color={colors.heroSoft} style={styles.statLabel}>
              Số khoản chi
            </AppText>
            <AppText weight="bold" color={colors.heroInk} style={styles.statValue}>
              {count}
            </AppText>
          </View>
          {average !== null && (
            <View style={styles.statRight}>
              <AppText color={colors.heroSoft} style={styles.statLabel}>
                Trung bình/ngày
              </AppText>
              <AppText weight="bold" color={colors.heroInk} style={styles.statValue}>
                {formatVnd(average)}
              </AppText>
            </View>
          )}
        </View>

        {budget && (
          <>
            <View style={[styles.track, { backgroundColor: colors.heroTrack }]}>
              <View style={[styles.fill, { width: `${budget.usedPercent}%`, backgroundColor: budget.over ? '#FF9A94' : colors.heroInk }]} />
            </View>
            <View style={styles.row}>
              <AppText color={colors.heroSoft} style={styles.rowText} numberOfLines={1} adjustsFontSizeToFit>
                {budget.over ? 'Vượt ngân sách' : 'Còn lại'}{' '}
                <AppText weight="semibold" color={colors.heroInk} style={styles.rowText}>
                  {formatVnd(Math.abs(budget.remaining))}
                </AppText>
              </AppText>
              <AppText color={colors.heroSoft} style={styles.rowText} numberOfLines={1} adjustsFontSizeToFit>
                {period.mode === 'year' ? 'Ngân sách năm' : 'Ngân sách'}{' '}
                <AppText weight="semibold" color={colors.heroInk} style={styles.rowText}>
                  {formatVnd(budget.budget)}
                </AppText>
              </AppText>
            </View>
            {budget.perDay !== null && (
              <AppText color={colors.heroSoft} style={styles.dayText} numberOfLines={1} adjustsFontSizeToFit>
                Còn {budget.daysLeft} ngày · mỗi ngày chi được khoảng{' '}
                <AppText weight="semibold" color={colors.heroInk} style={styles.dayText}>
                  {formatVnd(budget.perDay)}
                </AppText>
              </AppText>
            )}
          </>
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cài đặt" hitSlop={6} onPress={onSettings} style={[styles.gear, { backgroundColor: colors.heroTrack }]}>
        <SvgIcon name="gear" size={18} color={colors.heroInk} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: AppRadius.hero, overflow: 'hidden' },
  hero: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 18, gap: 12 },
  label: { fontSize: 13.5, lineHeight: 20 },
  statsRule: { height: 1, marginTop: 2 },
  statLabel: { fontSize: 13, lineHeight: 18 },
  statValue: { fontSize: 20, lineHeight: 28 },
  statRight: { alignItems: 'flex-end' },
  total: { fontSize: 40, lineHeight: 46, letterSpacing: -0.8, marginTop: 2 },
  currency: { fontSize: 21.5, lineHeight: 24, letterSpacing: 0 },
  track: { height: 8, borderRadius: 99, overflow: 'hidden', marginTop: 1 },
  fill: { height: '100%', borderRadius: 99 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowText: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
  dayText: { fontSize: 12.2, lineHeight: 18 },
  head: { paddingRight: 40 },
  /** Biểu tượng bánh răng ở góc phải trên của thẻ. */
  gear: { position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
