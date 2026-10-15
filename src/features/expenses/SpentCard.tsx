import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { PwaColors } from '@/constants/theme';
import { periodPhrase, spentLabel, type BudgetSummary, type CategorySummary } from '@/domain/expenses';
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

/** Thẻ "Đã chi": tổng chi, ngân sách, và (khi bấm) chi tiêu cá nhân theo từng mục. */
export function SpentCard({ period, loaded, total, budget, summaries, expanded, onToggle, onOpenCategory, onOpenAll }: Props) {
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        style={styles.hero}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${spentLabel(period)}: ${formatVnd(total)}`}>
        <Text style={styles.label}>{loaded ? spentLabel(period) : 'Đang mở sổ…'}</Text>
        <Text style={styles.total} adjustsFontSizeToFit numberOfLines={1}>
          {formatGrouped(total)}
          <Text style={styles.currency}> ₫</Text>
        </Text>

        {budget && (
          <>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${budget.usedPercent}%` }, budget.over && styles.fillOver]} />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowText} numberOfLines={1} adjustsFontSizeToFit>
                {budget.over ? 'Vượt ngân sách' : 'Còn lại'} <Text style={styles.bold}>{formatVnd(Math.abs(budget.remaining))}</Text>
              </Text>
              <Text style={styles.rowText} numberOfLines={1} adjustsFontSizeToFit>
                {period.mode === 'year' ? 'Ngân sách năm' : 'Ngân sách'} <Text style={styles.bold}>{formatVnd(budget.budget)}</Text>
              </Text>
            </View>
            {budget.perDay !== null && (
              <Text style={styles.rowText} numberOfLines={1} adjustsFontSizeToFit>
                Còn {budget.daysLeft} ngày · mỗi ngày chi được khoảng <Text style={styles.bold}>{formatVnd(budget.perDay)}</Text>
              </Text>
            )}
          </>
        )}
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.section}>
          <Pressable style={styles.sectionHeader} onPress={onOpenAll} accessibilityRole="button">
            <Text style={styles.sectionTitle}>
              Chi tiêu cá nhân <Text style={styles.sectionPeriod}>{periodPhrase(period)}</Text>
            </Text>
            <Text style={styles.sectionArrow}>›</Text>
          </Pressable>
          {summaries.map((item) => (
            <Pressable
              key={item.category.id}
              style={[styles.cat, item.sum === 0 && styles.catZero]}
              disabled={item.sum === 0}
              accessibilityRole="button"
              accessibilityLabel={`${item.category.name}, ${formatVnd(item.sum)}`}
              accessibilityState={{ disabled: item.sum === 0 }}
              onPress={() => onOpenCategory(item.category.id)}>
              <CategoryIcon category={item.category} />
              <View style={styles.catBody}>
                <View style={styles.catTop}>
                  <Text style={styles.catName} numberOfLines={1}>
                    {item.category.name}
                    {item.n > 0 && <Text style={styles.catMeta}> · {item.n} khoản</Text>}
                  </Text>
                  <Text style={styles.catAmount}>{formatVnd(item.sum)}</Text>
                </View>
                <View style={styles.catTrack}>
                  <View
                    style={[
                      styles.catFill,
                      { width: `${total ? (item.sum / total) * 100 : 0}%`, backgroundColor: item.category.color },
                    ]}
                  />
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
  card: {
    backgroundColor: PwaColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PwaColors.line,
    overflow: 'hidden',
  },
  hero: { padding: 20, gap: 10 },
  label: { fontSize: 13, color: PwaColors.muted },
  total: { fontSize: 40, fontWeight: '700', color: PwaColors.ink },
  currency: { fontSize: 20, fontWeight: '600', color: PwaColors.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: PwaColors.surface2, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 4, backgroundColor: PwaColors.primary },
  fillOver: { backgroundColor: PwaColors.danger },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowText: { fontSize: 13, color: PwaColors.muted, flexShrink: 1 },
  bold: { fontWeight: '700', color: PwaColors.ink },
  chevron: { alignSelf: 'center', fontSize: 10, color: PwaColors.muted, marginTop: 2 },
  section: { borderTopWidth: 1, borderTopColor: PwaColors.line, paddingHorizontal: 20, paddingVertical: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: PwaColors.ink },
  sectionPeriod: { fontSize: 13, fontWeight: '400', color: PwaColors.muted },
  sectionArrow: { fontSize: 22, color: PwaColors.muted },
  cat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: PwaColors.line,
  },
  catZero: { opacity: 0.55 },
  catBody: { flex: 1, gap: 6, minWidth: 0 },
  catTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  catName: { flex: 1, fontSize: 15, fontWeight: '600', color: PwaColors.ink },
  catMeta: { fontSize: 13, fontWeight: '400', color: PwaColors.muted },
  catAmount: { fontSize: 15, fontWeight: '600', color: PwaColors.ink },
  catTrack: { height: 4, borderRadius: 2, backgroundColor: PwaColors.surface2, overflow: 'hidden' },
  catFill: { height: '100%', borderRadius: 2 },
});
