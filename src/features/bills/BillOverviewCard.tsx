import { useMemo } from 'react';

import { SummaryCard } from '@/components/design';
import { buildBillOverviewCard } from '@/domain/billHistory';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
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