import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { formatMoney } from '@/domain/billForm';
import { buildBillOverviewCard } from '@/domain/billHistory';
import { personBillSummary } from '@/domain/billPerson';
import { periodTitle } from '@/domain/expenses';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';

interface Props {
  period: Period;
  /** Bấm tiêu đề hoặc một người để mở lịch sử bill của kỳ đang xem. */
  onOpen: () => void;
  /** Bấm số tiền của một người trong mục "Chi tiết" để xem các bill của người đó trong kỳ. */
  onOpenPerson: (name: string) => void;
}

/**
 * Khung "Chia bill" ở Tổng quan (`#tqBill` của PWA): số bill và tổng bill trong kỳ đang xem, rồi những người đã chi
 * tiền kèm thanh so sánh. Quá 3 người thì có "Xem thêm N người" / "Thu gọn". Cuối khung là "Chi tiết" (đang gập): mỗi người một số tiền còn phải thanh toán của các bill
 * trong kỳ đang xem; bấm vào để xem các bill của người đó. Như PWA, khung luôn hiện.
 */
const GET = '#0F8A4B';
const OWE = '#D64545';

export function BillOverviewCard({ period, onOpen, onOpenPerson }: Props) {
  const colors = useColors();
  const { bills, pays, loaded, error } = useDebtData();
  const [showAll, setShowAll] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const summary = useMemo(() => personBillSummary(bills, pays, period), [bills, pays, period]);
  const card = useMemo(() => buildBillOverviewCard(bills, period, showAll), [bills, period, showAll]);

  if (error || !loaded) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Chia bill, ${card.count} bill, ${formatMoney(card.total)}`} onPress={onOpen} style={styles.header}>
        <AppText weight="bold" style={styles.title}>
          Chia bill
        </AppText>
        <View style={styles.headerRight}>
          <AppText weight="medium" color={colors.muted} style={styles.small}>
            {card.count} bill
          </AppText>
          <AppText weight="medium" style={styles.small}>
            {formatMoney(card.total)}
          </AppText>
        </View>
        <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
      </Pressable>

      {card.rows.map((row) => (
        <Pressable
          key={row.name}
          accessibilityRole="button"
          accessibilityLabel={`${row.name} đã chi ${formatMoney(row.amount)}`}
          onPress={onOpen}
          style={[styles.person, { borderTopColor: colors.line }]}>
          <View style={styles.personTop}>
            <AppText style={styles.name} numberOfLines={1}>
              {row.name}
            </AppText>
            <AppText weight="bold" style={styles.amount}>
              {formatMoney(row.amount)}
            </AppText>
          </View>
          <View style={[styles.track, { backgroundColor: colors.line }]}>
            <View style={[styles.fill, { width: `${row.percent}%`, backgroundColor: colors.primary }]} />
          </View>
        </Pressable>
      ))}

      {(card.hidden > 0 || card.canCollapse) && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showAll }}
          onPress={() => setShowAll((open) => !open)}
          style={[styles.more, { borderTopColor: colors.line }]}>
          <AppText weight="semibold" color={colors.primary} style={styles.moreText}>
            {showAll ? 'Thu gọn' : `Xem thêm ${card.hidden} người`}
          </AppText>
        </Pressable>
      )}

      <View style={[styles.detail, { borderTopColor: colors.line }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailOpen }} onPress={() => setDetailOpen((open) => !open)} style={styles.detailHead}>
          <AppText weight="bold" style={styles.detailTitle}>
            Chi tiết
            <AppText weight="medium" color={colors.muted} style={styles.small}>
              {'  '}
              {periodTitle(period)}
            </AppText>
          </AppText>
          <AppText color={colors.muted} style={styles.small}>
            {summary.length} người
          </AppText>
          <View style={{ transform: [{ rotate: detailOpen ? '-90deg' : '90deg' }] }}>
            <SvgIcon name="chevronRight" size={18} color={colors.muted} />
          </View>
        </Pressable>
        {detailOpen &&
          (summary.length === 0 ? (
            <AppText color={colors.muted} style={styles.empty}>
              Không có khoản bill nào còn phải thanh toán trong khoảng này
            </AppText>
          ) : (
            summary.map((person, index) => (
              <Pressable
                key={person.name}
                accessibilityRole="button"
                accessibilityLabel={`Bill của ${person.name}, còn phải thanh toán ${formatMoney(Math.abs(person.amount))}`}
                onPress={() => onOpenPerson(person.name)}
                style={[styles.billRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <AppText weight="semibold" style={styles.billTitle} numberOfLines={1}>
                  {person.name}
                </AppText>
                <AppText weight="bold" color={person.tone === 'get' ? GET : person.tone === 'owe' ? OWE : colors.muted} style={styles.billAmount}>
                  {person.tone === 'get' ? '+' : person.tone === 'owe' ? '−' : ''}
                  {formatMoney(Math.abs(person.amount))}
                </AppText>
                <SvgIcon name="chevronRight" size={16} color={colors.muted} />
              </Pressable>
            ))
          ))}
      </View>
    </View>
  );
}

// Số đo theo `.tqc` của PWA: bo 16, viền 1, đệm 6/16; tiêu đề cao 52 chữ 17/700; mỗi người đệm 9/0/10, tên 15.5,
// số tiền 16/700, thanh cao 6 bo tròn; "Xem thêm" cao 40, viền trên nét đứt, chữ 14/600.
const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 16 },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 17 },
  headerRight: { marginLeft: 'auto', alignItems: 'flex-end' },
  small: { fontSize: 12.5 },
  person: { paddingTop: 9, paddingBottom: 10, gap: 6, borderTopWidth: 1 },
  personTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  name: { flex: 1, minWidth: 0, fontSize: 15.5 },
  amount: { fontSize: 16 },
  track: { height: 6, borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
  more: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderStyle: 'dashed' },
  moreText: { fontSize: 14 },
  detail: { borderTopWidth: 1 },
  detailHead: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTitle: { flex: 1, fontSize: 16 },
  empty: { textAlign: 'center', fontSize: 14, paddingTop: 12, paddingBottom: 12 },
  billRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 6 },
  billTitle: { flex: 1, minWidth: 0, fontSize: 15.5 },
  billAmount: { fontSize: 16, marginLeft: 'auto' },
});
