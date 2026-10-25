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

type SpendItem = { id: string; title: string; date: string; amount: number; advanceId?: string };

/** Các khoản chi từ tiền ứng của MỘT người trong một quỹ (`fundId` = mã quỹ hoặc 'all'), mới nhất trước; `advanceId` thì chỉ lấy các khoản chi từ lần giao ứng đó. Mỗi dòng kèm `advanceId` (lần giao bị trừ). */
export function advanceSpendItems(data: FundData, fundId: string, person: string, advanceId?: string): SpendItem[] {
  const source = new Map(data.expenses.map((expense) => [expense.id, expense.advanceId]));
  const items = buildPersonFundDetail(data, fundId, person)
    .items.filter((item) => item.kind === 'advanceSpend')
    .map((item) => ({ ...item, advanceId: source.get(item.id) }));
  return advanceId ? items.filter((item) => item.advanceId === advanceId) : items;
}

/**
 * Lịch sử chi của MỘT hoặc nhiều lần giao (trang Chi tiết giao quỹ): mỗi khoản chi hiện NGUYÊN (một khoản chi bị chia vào nhiều lần giao vẫn là một dòng, đủ tiền),
 * miễn là có ít nhất một phần trừ vào các lần giao này. Cùng ngày + cùng nội dung được xem là một khoản chi (như `mergeSameDaySpends`).
 */
export function lotSpendItems(data: FundData, lots: readonly { id: string; fundId: string; person: string }[]): SpendItem[] {
  if (lots.length === 0) return [];
  const ids = new Set(lots.map((lot) => lot.id));
  const all = advanceSpendItems(data, lots[0].fundId, lots[0].person);
  const touched = new Set(all.filter((item) => item.advanceId && ids.has(item.advanceId)).map((item) => `${item.date}|${item.title}`));
  return all.filter((item) => touched.has(`${item.date}|${item.title}`));
}

/** Khung "Quỹ giao A ứng chi" dùng chung (trang Nợ quỹ và chi tiết lịch sử quỹ): thẻ lịch sử vuốt Sửa / Xoá, chạm xem chi tiết. */
type SpendRow = SpendItem & { ids: string[]; advanceIds: string[] };

/** Gộp các khoản chi từ tiền ứng CÙNG NGÀY, cùng nội dung thành một khoản (cộng số tiền; giữ vị trí dòng đầu; `id` = khoản đầu, `ids` = mọi khoản gộp, `advanceIds` = các lần giao bị trừ). */
export function mergeSameDaySpends(items: readonly SpendItem[]): SpendRow[] {
  const merged: SpendRow[] = [];
  for (const item of items) {
    const same = merged.find((row) => row.date === item.date && row.title === item.title);
    if (same) {
      same.amount += item.amount;
      same.ids.push(item.id);
      if (item.advanceId && !same.advanceIds.includes(item.advanceId)) same.advanceIds.push(item.advanceId);
    } else merged.push({ ...item, ids: [item.id], advanceIds: item.advanceId ? [item.advanceId] : [] });
  }
  return merged;
}

/** Ghi chú "Chi từ giao ngày dd/mm · dd/mm" khi khoản chi trừ vào từ 2 lần giao trở lên; rỗng nếu không. */
function splitNote(advanceIds: readonly string[], dateOf?: (advanceId: string) => string | undefined): string {
  if (!dateOf || advanceIds.length < 2) return '';
  const days = advanceIds
    .map((id) => dateOf(id))
    .filter((date): date is string => !!date)
    .sort()
    .map((date) => formatVnDate(date).slice(0, 5));
  return days.length > 1
    ? `
Chi từ giao ngày ${days.join(' · ')}`
    : '';
}

export function AdvanceSpendCard({
  title,
  items,
  reload,
  highlightId,
  sourceDateOf,
}: {
  title: string;
  items: SpendItem[];
  reload: () => Promise<void>;
  highlightId?: string;
  /** Có thì khoản chi bị chia vào NHIỀU lần giao được ghi chú nhỏ "Chi từ giao ngày …" (ngày của từng lần giao). */
  sourceDateOf?: (advanceId: string) => string | undefined;
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
                router.push({ pathname: '/quy/chi-tiet', params: { kind: 'expense', id: entry.id, ...(entry.ids.length > 1 ? { ids: entry.ids.join(',') } : {}) } });
              }}
              onEdit={() => {
                setOpenId(null);
                router.push({ pathname: '/quy/sua', params: { kind: 'expense', id: entry.id } });
              }}
              onDelete={() => void remove(entry.ids)}
              accessibilityLabel={`${entry.title}, -${formatVnd(entry.amount)}`}
              icon={<FundEntryIcon kind="expense" mode="advance" />}
              title={entry.title}
              subtitle={formatVnDate(entry.date) + (entry.ids.includes(highlightId ?? '') ? ' · đang xem' : '') + splitNote(entry.advanceIds, sourceDateOf)}
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
