import { useMemo } from 'react';

import { EmptyState, Panel, PersonAmountRow, SectionHeader, SummaryCard } from '@/components/design';
import { buildBillOverviewCard } from '@/domain/billHistory';
import { personBillSummary } from '@/domain/billPerson';
import { periodTitle } from '@/domain/expenses';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Pay } from '@/types/pay';
import { formatVnd } from '@/utils/format';

interface StatProps {
  bills: readonly Bill[];
  period: Period;
  style?: React.ComponentProps<typeof SummaryCard>['style'];
}

/** Thẻ số liệu "Chia bill" (chỉ xem): số bill và tổng tiền các bill trong kỳ đang xem. */
export function BillStatCard({ bills, period, style }: StatProps) {
  const card = useMemo(() => buildBillOverviewCard(bills, period, true), [bills, period]);
  return <SummaryCard label="Chia bill" icon="receipt" tint="blue" value={formatVnd(card.total)} caption={`${card.count} bill`} style={style} />;
}

interface DetailProps {
  bills: readonly Bill[];
  pays: readonly Pay[];
  period: Period;
  /** Bấm một người để xem các bill của người đó trong kỳ. */
  onOpenPerson: (name: string) => void;
  /** Mở lịch sử chia bill của kỳ đang xem. */
  onOpenHistory: () => void;
}

/**
 * Khu vực "Chi tiết chia bill" ở Tổng quan: mỗi người một số tiền còn phải thanh toán của các bill trong kỳ đang xem
 * (tên bên trái, số tiền căn phải). Không liệt kê từng bill ở đây; bấm một người để xem danh sách bill của họ.
 */
export function BillDetailSection({ bills, pays, period, onOpenPerson, onOpenHistory }: DetailProps) {
  const summary = useMemo(() => personBillSummary(bills, pays, period), [bills, pays, period]);
  return (
    <>
      <SectionHeader title="Chi tiết chia bill" subtitle={periodTitle(period)} actionLabel="Lịch sử bill" onAction={onOpenHistory} />
      <Panel>
        {summary.length === 0 ? (
          <EmptyState text="Không có khoản bill nào còn phải thanh toán trong khoảng này" icon="check" />
        ) : (
          summary.map((person, index) => (
            <PersonAmountRow
              key={person.name}
              first={index === 0}
              name={person.name}
              amount={`${person.tone === 'get' ? '+' : person.tone === 'owe' ? '−' : ''}${formatVnd(Math.abs(person.amount))}`}
              tone={person.tone}
              accessibilityLabel={`Bill của ${person.name}, còn phải thanh toán ${formatVnd(Math.abs(person.amount))}`}
              onPress={() => onOpenPerson(person.name)}
            />
          ))
        )}
      </Panel>
    </>
  );
}
