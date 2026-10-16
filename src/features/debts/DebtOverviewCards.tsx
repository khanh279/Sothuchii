import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { formatMoney } from '@/domain/billForm';
import { buildDebtOverview } from '@/domain/debtOverview';
import { periodTitle } from '@/domain/expenses';
import { buildPayHistory } from '@/domain/payForm';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { withAlpha } from '@/utils/color';

const GET = '#0F8A4B';
const OWE = '#D64545';
const SIGN = { get: '+', owe: '−', mid: '' } as const;

interface Props {
  period: Period;
  /** Bấm một người để xem nợ với người đó. */
  onOpenPerson: (name: string) => void;
  /** Bấm một cặp (bill giữa hai người trong kỳ). */
  onOpenPair: (from: string, to: string) => void;
  /** Bấm khung "Giao dịch" để xem lịch sử khoản trả của kỳ. */
  onOpenPays: () => void;
}

/**
 * Các khung Công nợ ở Tổng quan (`#debt-box`, `#dsx-box`, `#tqTx` của PWA): "Nợ" (Tôi nợ / Người khác nợ tôi, mỗi người một
 * số tổng nợ (vay + bill, có dấu), kèm mục "Chi tiết" theo cặp trong kỳ) và "Giao dịch" (số khoản và +vào −ra của kỳ). Như PWA, luôn hiện.
 */
export function DebtOverviewCards({ period, onOpenPerson, onOpenPair, onOpenPays }: Props) {
  const colors = useColors();
  const { bills, pays, loaded, error } = useDebtData();
  const [detailOpen, setDetailOpen] = useState(false);
  const overview = useMemo(() => buildDebtOverview(bills, pays, period), [bills, pays, period]);
  const history = useMemo(() => buildPayHistory(pays, bills, period), [pays, bills, period]);

  if (error || !loaded) return null;
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }];

  return (
    <>
      <View style={[...card, styles.debtCard]}>
        <AppText weight="bold" style={styles.heading}>
          Nợ
        </AppText>
        <View style={styles.kpis}>
          <View style={[styles.kpi, { backgroundColor: withAlpha(OWE, 0.12) }]}>
            <AppText weight="semibold" style={styles.kpiLabel}>
              Tôi nợ
            </AppText>
            <AppText weight="bold" color={OWE} style={styles.kpiValue} numberOfLines={1}>
              {overview.oweSigned ? '−' : ''}
              {formatMoney(overview.owe)}
            </AppText>
          </View>
          <View style={[styles.kpi, { backgroundColor: withAlpha(GET, 0.12) }]}>
            <AppText weight="semibold" style={styles.kpiLabel}>
              Người khác nợ tôi
            </AppText>
            <AppText weight="bold" color={GET} style={styles.kpiValue} numberOfLines={1}>
              {overview.getSigned ? '+' : ''}
              {formatMoney(overview.get)}
            </AppText>
          </View>
        </View>

        {overview.people.length === 0 ? (
          <AppText color={colors.muted} style={styles.empty}>
            Không còn khoản nợ nào
          </AppText>
        ) : (
          overview.people.map((person, index) => (
            <Pressable
              key={person.name}
              accessibilityRole="button"
              accessibilityLabel={`Xem chi tiết nợ với ${person.name}`}
              onPress={() => onOpenPerson(person.name)}
              style={[styles.person, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
              <AppText weight="semibold" style={styles.name} numberOfLines={2}>
                {person.name}
              </AppText>
              <AppText weight="bold" color={person.tone === 'get' ? GET : person.tone === 'owe' ? OWE : colors.muted} style={styles.lineValue}>
                {SIGN[person.tone]}
                {formatMoney(Math.abs(person.total))}
              </AppText>
              <SvgIcon name="chevronRight" size={16} color={colors.muted} />
            </Pressable>
          ))
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
              {overview.pairs.length} khoản
            </AppText>
            <View style={{ transform: [{ rotate: detailOpen ? '-90deg' : '90deg' }] }}>
              <SvgIcon name="chevronRight" size={18} color={colors.muted} />
            </View>
          </Pressable>
          {detailOpen &&
            (overview.pairs.length === 0 ? (
              <AppText color={colors.muted} style={styles.empty}>
                Không còn khoản nợ nào
              </AppText>
            ) : (
              overview.pairs.map((pair, index) => (
                <Pressable
                  key={`${pair.from}>${pair.to}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Chi tiết bill ${pair.from} nợ ${pair.to}`}
                  onPress={() => onOpenPair(pair.from, pair.to)}
                  style={[styles.pair, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                  <AppText weight="semibold" color={pair.from === 'Tôi' ? colors.primary : colors.ink} style={styles.box} numberOfLines={2}>
                    {pair.from}
                  </AppText>
                  <AppText color={pair.tone === 'owe' ? OWE : pair.tone === 'get' ? GET : colors.muted} style={styles.arrow} accessibilityLabel="trả cho">
                    →
                  </AppText>
                  <AppText weight="semibold" color={pair.to === 'Tôi' ? colors.primary : colors.ink} style={[styles.box, styles.boxTo]} numberOfLines={2}>
                    {pair.to}
                  </AppText>
                  <AppText weight="bold" color={pair.tone === 'owe' ? OWE : pair.tone === 'get' ? GET : colors.ink} style={styles.pairAmount}>
                    {SIGN[pair.tone]}
                    {formatMoney(pair.amt)}
                  </AppText>
                  <SvgIcon name="chevronRight" size={16} color={colors.muted} />
                </Pressable>
              ))
            ))}
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={onOpenPays} style={[...card, styles.payCard]}>
        <AppText weight="bold" style={styles.heading}>
          Giao dịch
        </AppText>
        <View style={styles.payRight}>
          <AppText weight="semibold" color={colors.muted} style={styles.paySmall}>
            {history.count} khoản
          </AppText>
          <AppText weight="semibold" style={styles.paySum}>
            <AppText color={GET} style={styles.paySum}>
              +{formatMoney(history.totalIn)}
            </AppText>
            <AppText color={OWE} style={styles.paySum}>
              {'  '}−{formatMoney(history.totalOut)}
            </AppText>
          </AppText>
        </View>
        <SvgIcon name="chevronRight" size={16} color={colors.muted} />
      </Pressable>
    </>
  );
}

// Số đo theo `.debtcard` / `.tqc` / `.dsx` của PWA: thẻ bo 16 viền 1 đệm 14 (đáy 6); tiêu đề 17/700; hai ô tổng bo 14 đệm 8/12;
// dòng người đệm 9/0, tên 15.5–17/600, hai dòng Vay / Bill cỡ 14–16; "Chi tiết" cao 46; dòng cặp cao 44–50.
const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1 },
  debtCard: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 },
  heading: { fontSize: 17 },
  kpis: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 12 },
  kpi: { flex: 1, minWidth: 0, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  kpiLabel: { fontSize: 12.5 },
  kpiValue: { fontSize: 20, lineHeight: 26 },
  empty: { textAlign: 'center', fontSize: 14, paddingTop: 12, paddingBottom: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  name: { flex: 1, minWidth: 0, fontSize: 16 },
  lineValue: { fontSize: 15, lineHeight: 19 },
  small: { fontSize: 12.5 },
  detail: { marginTop: 8, borderTopWidth: 1 },
  detailHead: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTitle: { flex: 1, fontSize: 16 },
  pair: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: { flexShrink: 1, maxWidth: '32%', fontSize: 15.5 },
  boxTo: { flex: 1, maxWidth: undefined },
  arrow: { fontSize: 24, paddingHorizontal: 8 },
  pairAmount: { fontSize: 16, marginLeft: 'auto' },
  payCard: { paddingVertical: 6, paddingHorizontal: 16, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  payRight: { marginLeft: 'auto', alignItems: 'flex-end', gap: 2 },
  paySmall: { fontSize: 13 },
  paySum: { fontSize: 12 },
});
