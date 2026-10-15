import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { buildOverviewFundCard } from '@/domain/fundHistory';
import { useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { formatVnd } from '@/utils/format';

const IN_COLOR = '#0F8A4B';
const OUT_COLOR = '#D64545';

interface Props {
  period: Period;
  /** Bấm một quỹ để xem lịch sử của quỹ đó trong kỳ đang xem. */
  onOpenFund: (fundId: string) => void;
}

/**
 * Khung "Quỹ" ở Tổng quan (`.qcard` của PWA): số quỹ, tổng đóng/chi trong kỳ đang xem và số dư từng quỹ
 * (xếp theo |số dư| giảm dần). Không hiện khi chưa có quỹ. Quá 4 quỹ thì có "Thu gọn" / "Xem thêm".
 */
export function FundOverviewCard({ period, onOpenFund }: Props) {
  const colors = useColors();
  const { data, loaded, error } = useFundData();
  const [showAll, setShowAll] = useState(true);
  const card = useMemo(() => buildOverviewFundCard(data, period, showAll), [data, period, showAll]);

  if (error || !loaded || card.fundCount === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.header}>
        <AppText weight="bold" style={styles.title}>
          Quỹ
        </AppText>
        <View style={styles.headerRight}>
          <AppText weight="medium" color={colors.muted} style={styles.small}>
            {card.fundCount} quỹ
          </AppText>
          <AppText style={styles.small}>
            <AppText color={IN_COLOR} style={styles.small}>
              +{formatVnd(card.totalIn)}
            </AppText>
            <AppText color={OUT_COLOR} style={styles.small}>
              {'  '}−{formatVnd(card.totalOut)}
            </AppText>
          </AppText>
        </View>
      </View>

      {card.rows.map(({ fund, bal }, index) => (
        <Pressable
          key={fund.id}
          accessibilityRole="button"
          accessibilityLabel={`${fund.name}, số dư ${formatVnd(bal)}`}
          onPress={() => onOpenFund(fund.id)}
          style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
          <AppText style={styles.fundName} numberOfLines={1}>
            {fund.name}
          </AppText>
          <AppText weight="bold" color={bal < 0 ? OUT_COLOR : IN_COLOR} style={styles.balance}>
            {formatVnd(bal)}
          </AppText>
          <SvgIcon name="chevronRight" size={14} color={colors.muted} />
        </Pressable>
      ))}

      {card.hidden > 0 && (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={[styles.more, { borderTopColor: colors.line }]}>
          <AppText weight="semibold" color={colors.primary} style={styles.moreText}>
            Xem thêm {card.hidden} quỹ
          </AppText>
        </Pressable>
      )}
      {card.canCollapse && (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(false)} style={[styles.more, { borderTopColor: colors.line }]}>
          <AppText weight="semibold" color={colors.primary} style={styles.moreText}>
            Thu gọn
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

// Số đo theo `.mod-b .qcard`: bo 16, viền 1, đệm 14/16/8; dòng cao 46; nút "Xem thêm" cao 40, viền trên nét đứt.
const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 30, marginBottom: 4 },
  title: { fontSize: 17 },
  headerRight: { alignItems: 'flex-end' },
  small: { fontSize: 12.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 },
  fundName: { flex: 1, minWidth: 0, fontSize: 15.5 },
  balance: { fontSize: 16 },
  more: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderStyle: 'dashed' },
  moreText: { fontSize: 14 },
});
