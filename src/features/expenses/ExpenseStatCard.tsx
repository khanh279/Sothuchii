import { useMemo } from 'react';

import { SummaryCard } from '@/components/design';
import { summarizeByCategory } from '@/domain/expenses';
import type { Expense, ExpenseSettings } from '@/types/expense';
import { formatVnd } from '@/utils/format';

interface Props {
  items: readonly Pick<Expense, 'a' | 'c'>[];
  settings: ExpenseSettings;
  style?: React.ComponentProps<typeof SummaryCard>['style'];
}

/**
 * Thẻ số liệu "Chi tiêu" (chỉ xem, không bấm): tổng chi cá nhân trong kỳ đang xem, số khoản và mục chi nhiều nhất.
 * Số liệu lấy từ `summarizeByCategory` đã có; mở lịch sử bằng tab Chi tiêu.
 */
export function ExpenseStatCard({ items, settings, style }: Props) {
  const { total, top } = useMemo(() => {
    const rows = summarizeByCategory(items, settings).filter((row) => row.sum > 0);
    const best = rows.reduce<(typeof rows)[number] | null>((acc, row) => (acc === null || row.sum > acc.sum ? row : acc), null);
    return { total: rows.reduce((sum, row) => sum + row.sum, 0), top: best };
  }, [items, settings]);
  return (
    <SummaryCard
      label="Chi tiêu"
      icon="tabOverview"
      tint="orange"
      value={formatVnd(total)}
      caption={`${items.length} khoản${top ? `\nNhiều nhất: ${top.category.name}` : ''}`}
      style={style}
    />
  );
}
