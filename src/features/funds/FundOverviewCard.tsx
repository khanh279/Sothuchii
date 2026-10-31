import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { Panel, PersonAmountRow, SectionHeader, SummaryCard } from '@/components/design';
import { buildOverviewFundCard } from '@/domain/fundHistory';
import { fundPosition } from '@/domain/fundAdvance';
import { useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { formatVnd } from '@/utils/format';

interface Props {
  period: Period;
  /** Bấm một quỹ để xem lịch sử của quỹ đó trong kỳ đang xem. */
  onOpenFund: (fundId: string) => void;
}

/**
 * Khu vực "Quỹ nhóm" ở Tổng quan: tên quỹ bên trái, số dư căn phải (xếp theo |số dư| giảm dần), dòng phụ là tổng đóng / chi
 * trong kỳ đang xem. Không hiện khi chưa có quỹ. Quá 4 quỹ thì có "Thu gọn" / "Xem thêm".
 */
export function FundOverviewCard({ period, onOpenFund }: Props) {
  const colors = useColors();
  const { data, loaded, error } = useFundData();
  const [showAll, setShowAll] = useState(true);
  const card = useMemo(() => buildOverviewFundCard(data, period, showAll), [data, period, showAll]);

  if (error || !loaded || card.fundCount === 0) return null;

  return (
    <>
      <SectionHeader title="Quỹ nhóm" subtitle={`${card.fundCount} quỹ · +${formatVnd(card.totalIn)} · −${formatVnd(card.totalOut)} trong kỳ`} />
      <Panel>
        {card.rows.map(({ fund, bal }, index) => (
          <PersonAmountRow
            key={fund.id}
            first={index === 0}
            name={fund.name}
            amount={formatVnd(bal)}
            tone={bal < 0 ? 'owe' : 'get'}
            accessibilityLabel={`${fund.name}, số dư ${formatVnd(bal)}`}
            onPress={() => onOpenFund(fund.id)}
          />
        ))}
        {card.hidden > 0 && (
          <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={styles.more}>
            <AppText weight="semibold" color={colors.accent} style={styles.moreText}>
              Xem thêm {card.hidden} quỹ
            </AppText>
          </Pressable>
        )}
        {card.canCollapse && (
          <Pressable accessibilityRole="button" onPress={() => setShowAll(false)} style={styles.more}>
            <AppText weight="semibold" color={colors.accent} style={styles.moreText}>
              Thu gọn
            </AppText>
          </Pressable>
        )}
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 14 },
});

/**
 * Thẻ số liệu "Quỹ nhóm" (chỉ xem, không bấm): TỔNG SỐ DƯ của các quỹ cộng lại (toàn thời gian, không phụ thuộc kỳ) và số quỹ.
 * Số dư là số còn lại thực tế của quỹ (thu trừ mọi khoản chi đã ghi); vào chi tiết bằng tab Quỹ nhóm.
 */
export function FundStatCard({ style }: { style?: React.ComponentProps<typeof SummaryCard>['style'] }) {
  const { data, loaded, error } = useFundData();
  const balance = useMemo(() => data.funds.reduce((sum, fund) => sum + fundPosition(data, fund.id).cash, 0), [data]);
  const ready = loaded && !error;
  return (
    <SummaryCard
      label="Quỹ nhóm"
      icon="people"
      tint="teal"
      value={ready ? formatVnd(balance) : '—'}
      tone={ready && balance < 0 ? 'owe' : undefined}
      caption={ready ? (data.funds.length === 0 ? 'Chưa có quỹ' : `${data.funds.length} quỹ`) : undefined}
      style={style}
    />
  );
}
