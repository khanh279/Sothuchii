import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

import { EmptyState, NavTile, Panel, PersonAmountRow, SectionHeader, SummaryCard } from '@/components/design';
import { buildDebtOverview } from '@/domain/debtOverview';
import { buildPayHistory } from '@/domain/payForm';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Pay } from '@/types/pay';
import { formatVnd } from '@/utils/format';
import { DEBT_ZERO } from '@/domain/ledger';

const SIGN = { get: '+', owe: '−', mid: '' } as const;

interface Props {
  bills: readonly Bill[];
  pays: readonly Pay[];
  period: Period;
}

/**
 * Thẻ số liệu "Công nợ" (chỉ xem): số dư tổng hợp theo logic hiện có (toàn thời gian, mỗi người một tổng vay + bill).
 * Số lớn là chênh lệch người khác nợ tôi trừ tôi nợ; hai số thành phần nằm ở thẻ `DebtSplitCard` bên cạnh.
 */
export function DebtStatCard({ bills, pays, period, style }: Props & { style?: React.ComponentProps<typeof SummaryCard>['style'] }) {
  const overview = useMemo(() => buildDebtOverview(bills, pays, period), [bills, pays, period]);
  const balance = overview.get - overview.owe;
  const tone = Math.abs(balance) < DEBT_ZERO ? 'mid' : balance > 0 ? 'get' : 'owe';
  return (
    <SummaryCard label="Công nợ" icon="tabTransactions" tint="purple" value={`${SIGN[tone]}${formatVnd(Math.abs(balance))}`} tone={tone} caption={`${overview.people.length} người`} style={style} />
  );
}

/**
 * Thẻ "Tôi nợ / Nợ tôi" (chỉ xem), cùng cỡ với thẻ Công nợ bên cạnh: hai dòng, mỗi dòng một chấm màu (đỏ = tôi nợ, xanh = nợ tôi), nhãn và số có dấu.
 * Số lớn tự thu nhỏ chữ để không xuống dòng.
 */
export function DebtSplitCard({ bills, pays, period, style }: Props & { style?: StyleProp<ViewStyle> }) {
  const overview = useMemo(() => buildDebtOverview(bills, pays, period), [bills, pays, period]);
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, style]} accessibilityLabel={`Tôi nợ ${formatVnd(overview.owe)}, nợ tôi ${formatVnd(overview.get)}`}>
      <SplitRow label="Tôi nợ" value={`−${formatVnd(overview.owe)}`} color={colors.danger} soft={colors.dangerSoft} />
      <View style={[styles.divider, { backgroundColor: colors.line }]} />
      <SplitRow label="Nợ tôi" value={`+${formatVnd(overview.get)}`} color={colors.success} soft={colors.successSoft} />
    </View>
  );
}

function SplitRow({ label, value, color, soft }: { label: string; value: string; color: string; soft: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={[styles.dot, { backgroundColor: soft }]}>
          <View style={[styles.dotCore, { backgroundColor: color }]} />
        </View>
        <AppText color={colors.muted} style={styles.label} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText weight="bold" color={color} style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: AppRadius.card, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', gap: 6 },
  divider: { height: StyleSheet.hairlineWidth },
  row: { gap: 0 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dotCore: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, lineHeight: 15 },
  value: { fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
});

/** Danh sách từng người còn nợ ("Công nợ"): tên và tổng nợ (vay + bill) căn phải; bấm một người để mở chi tiết nợ. */
export function DebtPeopleSection({ bills, pays, period, onOpenPerson }: Props & { onOpenPerson: (name: string) => void }) {
  const overview = useMemo(() => buildDebtOverview(bills, pays, period), [bills, pays, period]);
  return (
    <>
      <SectionHeader title="Từng người" subtitle="Tổng nợ vay và nợ bill của từng người" />
      <Panel>
        {overview.people.length === 0 ? (
          <EmptyState text="Không còn khoản nợ nào" icon="check" />
        ) : (
          overview.people.map((person, index) => (
            <PersonAmountRow
              key={person.name}
              first={index === 0}
              name={person.name}
              amount={`${SIGN[person.tone]}${formatVnd(Math.abs(person.total))}`}
              tone={person.tone}
              accessibilityLabel={`Xem chi tiết nợ với ${person.name}`}
              onPress={() => onOpenPerson(person.name)}
            />
          ))
        )}
      </Panel>
    </>
  );
}

/** Lối vào lịch sử giao dịch (chuyển tiền / trả bill): số khoản và tổng vào / ra của kỳ. */
export function PaysEntry({ bills, pays, period, onOpen }: Props & { onOpen: () => void }) {
  const history = useMemo(() => buildPayHistory(pays, bills, period), [pays, bills, period]);
  return <NavTile icon="tabTransactions" tint="orange" label="Giao dịch" caption={`${history.count} khoản · +${formatVnd(history.totalIn)} · −${formatVnd(history.totalOut)}`} onPress={onOpen} />;
}
