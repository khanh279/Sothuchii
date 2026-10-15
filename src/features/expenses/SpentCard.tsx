import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { periodTitle, spentLabel, type BudgetSummary, type CategorySummary } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { formatGrouped, formatVnd } from '@/utils/format';

interface Props {
  period: Period;
  loaded: boolean;
  total: number;
  budget: BudgetSummary | null;
  summaries: CategorySummary[];
  expanded: boolean;
  onToggle: () => void;
  onOpenCategory: (categoryId: string) => void;
  onOpenAll: () => void;
}

/**
 * Thẻ "Đã chi" của PWA (`.hero` + `.ovsec`): tổng chi, ngân sách, và khi bấm thì hiện
 * chi tiêu cá nhân theo từng mục ngay dưới, trong cùng một khung.
 */
export function SpentCard({ period, loaded, total, budget, summaries, expanded, onToggle, onOpenCategory, onOpenAll }: Props) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Pressable
        onPress={onToggle}
        style={styles.hero}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${spentLabel(period)}: ${formatVnd(total)}`}>
        <View>
          <AppText color={colors.muted} style={styles.label}>
            {loaded ? spentLabel(period) : 'Đang mở sổ…'}
          </AppText>
          <AppText weight="display" style={styles.total} adjustsFontSizeToFit numberOfLines={1}>
            {formatGrouped(total)}
            <AppText weight="display" style={styles.currency}>
              {' '}
              ₫
            </AppText>
          </AppText>
        </View>

        {budget && (
          <>
            <View style={[styles.track, { backgroundColor: colors.line }]}>
              <View style={[styles.fill, { width: `${budget.usedPercent}%`, backgroundColor: budget.over ? colors.danger : colors.primary }]} />
            </View>
            <View style={styles.row}>
              <AppText color={colors.muted} style={styles.rowText} numberOfLines={1} adjustsFontSizeToFit>
                {budget.over ? 'Vượt ngân sách' : 'Còn lại'}{' '}
                <AppText weight="semibold" style={styles.rowText}>
                  {formatVnd(Math.abs(budget.remaining))}
                </AppText>
              </AppText>
              <AppText color={colors.muted} style={styles.rowText} numberOfLines={1} adjustsFontSizeToFit>
                {period.mode === 'year' ? 'Ngân sách năm' : 'Ngân sách'}{' '}
                <AppText weight="semibold" style={styles.rowText}>
                  {formatVnd(budget.budget)}
                </AppText>
              </AppText>
            </View>
            {budget.perDay !== null && (
              <AppText color={colors.muted} style={styles.dayText} numberOfLines={1} adjustsFontSizeToFit>
                Còn {budget.daysLeft} ngày · mỗi ngày chi được khoảng{' '}
                <AppText weight="semibold" style={styles.dayText}>
                  {formatVnd(budget.perDay)}
                </AppText>
              </AppText>
            )}
          </>
        )}

        <View pointerEvents="none" style={[styles.chevron, { borderColor: colors.muted, transform: [{ rotate: expanded ? '225deg' : '45deg' }] }]} />
      </Pressable>

      {expanded && (
        <View style={[styles.section, { borderTopColor: colors.line }]}>
          <Pressable style={styles.sectionHeader} onPress={onOpenAll} accessibilityRole="button" accessibilityLabel="Xem lịch sử chi tiêu cá nhân">
            <View style={styles.sectionHeaderText}>
              <AppText weight="bold" style={styles.sectionTitle}>
                Chi tiêu cá nhân
              </AppText>
              <AppText weight="medium" color={colors.muted} style={styles.sectionPeriod}>
                {periodTitle(period)}
              </AppText>
            </View>
            <SvgIcon name="chevronRight" size={20} color={colors.muted} strokeWidth={2.2} />
          </Pressable>
          {summaries.map((item, index) => (
            <Pressable
              key={item.category.id}
              style={[
                styles.cat,
                { paddingTop: index === 0 ? 4 : 12, paddingBottom: index === summaries.length - 1 ? 0 : 12 },
                index < summaries.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.line },
                item.sum === 0 && styles.catZero,
              ]}
              disabled={item.sum === 0}
              accessibilityRole="button"
              accessibilityLabel={`${item.category.name}, ${formatVnd(item.sum)}`}
              accessibilityState={{ disabled: item.sum === 0 }}
              onPress={() => onOpenCategory(item.category.id)}>
              <CategoryIcon category={item.category} />
              <View style={styles.catBody}>
                <View style={styles.catTop}>
                  <AppText weight="semibold" style={styles.catName} numberOfLines={1}>
                    {item.category.name}
                    {item.n > 0 && (
                      <AppText color={colors.muted} style={styles.catMeta}>
                        {' '}
                        · {item.n} khoản
                      </AppText>
                    )}
                  </AppText>
                  <AppText weight="semibold" style={styles.catAmount}>
                    {formatVnd(item.sum)}
                  </AppText>
                </View>
                <View style={[styles.catTrack, { backgroundColor: colors.surface2 }]}>
                  <View style={[styles.catFill, { width: `${total ? (item.sum / total) * 100 : 0}%`, backgroundColor: item.category.color }]} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: AppRadius.hero, borderWidth: 1, overflow: 'hidden' },
  hero: { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16, gap: 12 },
  label: { fontSize: 13.5, lineHeight: 20 },
  total: { fontSize: 43, lineHeight: 45, letterSpacing: -0.86, marginTop: 1 },
  currency: { fontSize: 21.5, lineHeight: 24, letterSpacing: 0 },
  track: { height: 8, borderRadius: 99, overflow: 'hidden', marginTop: 1 },
  fill: { height: '100%', borderRadius: 99 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowText: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
  dayText: { fontSize: 12.2, lineHeight: 18 },
  chevron: { position: 'absolute', top: 20, right: 18, width: 8, height: 8, borderRightWidth: 2, borderBottomWidth: 2 },
  section: { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 1, paddingBottom: 9 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 17, lineHeight: 28 },
  sectionPeriod: { fontSize: 12, lineHeight: 17 },
  cat: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  catZero: { opacity: 0.55 },
  /* Cột chữ bắt đầu thấp hơn đỉnh biểu tượng 9px, thanh cách tên 15px (đo từ PWA). */
  catBody: { flex: 1, gap: 15, marginTop: 9, minWidth: 0 },
  catTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  catName: { flex: 1, fontSize: 15, lineHeight: 22 },
  catMeta: { fontSize: 12 },
  catAmount: { fontSize: 15, lineHeight: 22 },
  catTrack: { height: 5, borderRadius: 99, overflow: 'hidden' },
  catFill: { height: '100%', borderRadius: 99 },
});
