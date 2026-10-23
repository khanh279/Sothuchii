import { useMemo } from 'react';

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
 * Số lớn là chênh lệch người khác nợ tôi trừ tôi nợ; hai số thành phần ở dòng phụ.
 */
export function DebtStatCard({ bills, pays, period, style }: Props & { style?: React.ComponentProps<typeof SummaryCard>['style'] }) {
  const overview = useMemo(() => buildDebtOverview(bills, pays, period), [bills, pays, period]);
  const balance = overview.get - overview.owe;
  const tone = Math.abs(balance) < DEBT_ZERO ? 'mid' : balance > 0 ? 'get' : 'owe';
  return (
    <SummaryCard
      label="Công nợ"
      icon="tabTransactions"
      tint="purple"
      value={`${SIGN[tone]}${formatVnd(Math.abs(balance))}`}
      tone={tone}
      caption={`Tôi nợ ${formatVnd(overview.owe)}\nNợ tôi ${formatVnd(overview.get)}`}
      style={style}
    />
  );
}

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
