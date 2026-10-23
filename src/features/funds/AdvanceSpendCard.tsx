import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState, SectionCard } from '@/components/design';
import { HistoryCard } from '@/components/history-card';
import { useToast } from '@/components/toast';
import { deleteFundExpenseSynced } from '@/data/fundService';
import { advanceById } from '@/domain/fundAdvance';
import { buildPersonFundDetail } from '@/domain/fundPerson';
import { FundEntryIcon } from '@/features/funds/FundEntryIcon';
import { describeFundError } from '@/features/funds/hooks';
import type { FundData } from '@/types/fund';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Các khoản chi từ tiền ứng của MỘT người trong một quỹ (`fundId` = mã quỹ hoặc 'all'), mới nhất trước; `advanceId` thì chỉ lấy các khoản chi từ lần giao ứng đó. */
export function advanceSpendItems(data: FundData, fundId: string, person: string, advanceId?: string) {
  const items = buildPersonFundDetail(data, fundId, person).items.filter((item) => item.kind === 'advanceSpend');
  if (!advanceId) return items;
  const ids = new Set(data.expenses.filter((expense) => expense.advanceId === advanceId).map((expense) => expense.id));
  return items.filter((item) => ids.has(item.id));
}

/** Khung "Quỹ giao A ứng chi" dùng chung (trang Nợ quỹ và chi tiết lịch sử quỹ): thẻ lịch sử vuốt Sửa / Xoá, chạm xem chi tiết. */
type SpendRow = { id: string; title: string; date: string; amount: number; ids: string[] };

/** Gộp các khoản chi từ tiền ứng CÙNG NGÀY, cùng nội dung thành một khoản (cộng số tiền; giữ vị trí dòng đầu; `id` = khoản đầu, `ids` = mọi khoản gộp). */
export function mergeSameDaySpends(items: readonly { id: string; title: string; date: string; amount: number }[]): SpendRow[] {
  const merged: SpendRow[] = [];
  for (const item of items) {
    const same = merged.find((row) => row.date === item.date && row.title === item.title);
    if (same) {
      same.amount += item.amount;
      same.ids.push(item.id);
    } else merged.push({ ...item, ids: [item.id] });
  }
  return merged;
}

export function AdvanceSpendCard({
  title,
  items,
  reload,
  highlightId,
}: {
  title: string;
  items: { id: string; title: string; date: string; amount: number }[];
  reload: () => Promise<void>;
  highlightId?: string;
}) {
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = mergeSameDaySpends(items);

  async function remove(ids: string[]) {
    try {
      for (const id of ids) await deleteFundExpenseSynced(id);
      setOpenId(null);
      toast.show('Đã xóa khoản chi');
      await reload();
    } catch (e) {
      toast.show(describeFundError(e));
    }
  }

  return (
    <SectionCard title={title} rightTop={`${rows.length} khoản`}>
      {rows.length === 0 ? (
        <EmptyState text="Chưa có khoản chi nào" icon="check" />
      ) : (
        <View style={styles.rows}>
          {rows.map((entry) => (
            <HistoryCard
              key={entry.id}
              open={openId === entry.id}
              onOpen={() => setOpenId(entry.id)}
              onClose={() => setOpenId((current) => (current === entry.id ? null : current))}
              onPressRow={() => {
                setOpenId(null);
                router.push({ pathname: '/quy/chi-tiet', params: { kind: 'expense', id: entry.id } });
              }}
              onEdit={() => {
                setOpenId(null);
                router.push({ pathname: '/quy/sua', params: { kind: 'expense', id: entry.id } });
              }}
              onDelete={() => void remove(entry.ids)}
              accessibilityLabel={`${entry.title}, -${formatVnd(entry.amount)}`}
              icon={<FundEntryIcon kind="expense" mode="advance" />}
              title={entry.title}
              subtitle={formatVnDate(entry.date) + (entry.ids.includes(highlightId ?? '') ? ' · đang xem' : '')}
              amount={`−${formatVnd(entry.amount)}`}
              tone="owe"
            />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

/** Tên người của một hồ sơ ứng (để đặt tiêu đề khung). */
export const advancePersonOf = (data: FundData, advanceId: string) => advanceById(data, advanceId)?.person ?? '';

const styles = StyleSheet.create({
  rows: { gap: 6 },
});
