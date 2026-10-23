import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DetailField, DetailHero, DetailNotice } from '@/components/detail-parts';
import { Panel, ScreenTitle } from '@/components/design';
import { ADVANCE_STATE_LABEL, advanceById, advanceSummary, personalDebt, personalDebtLabel } from '@/domain/fundAdvance';
import { buildPersonFundDetail } from '@/domain/fundPerson';
import type { FundData } from '@/types/fund';
import { buildFundHistory, type FundHistoryEntry, type FundHistoryKind } from '@/domain/fundHistory';
import { AdvanceSpendCard, advanceSpendItems } from '@/features/funds/AdvanceSpendCard';
import { useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

const KIND_LABEL: Record<FundHistoryKind, string> = {
  contribution: 'Đóng quỹ',
  expense: 'Chi quỹ',
  advance: 'Giao tiền ứng',
  refund: 'Hoàn tiền ứng',
  payout: 'Quỹ trả cá nhân',
};
const MODE_LABEL = { personal: 'Cá nhân ứng tiền túi', advance: 'Chi từ tiền ứng trước' } as const;

/**
 * Chi tiết MỘT dòng lịch sử quỹ (tham số route `kind` = loại dòng, `id` = mã), cùng kiểu giao diện với Chi tiết chi tiêu: thẻ "Số tiền", bảng các dòng
 * (quỹ, loại, ngày, nội dung và thông tin riêng của từng loại: người đóng, người chi / hình thức chi, nguồn tiền đã chia, trạng thái ứng trước) và dòng
 * ghi chú cuối trang. Chỉ xem; sửa / xoá bằng cách vuốt dòng ở Lịch sử quỹ.
 */
export default function FundEntryDetailScreen() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, loaded, error, reload } = useFundData();

  const entry = useMemo<FundHistoryEntry | null>(() => {
    for (const day of buildFundHistory(data, 'all', { mode: 'all' }).days) {
      const found = day.entries.find((item) => item.kind === kind && item.id === id);
      if (found) return found;
    }
    return null;
  }, [data, kind, id]);

  let body;
  if (kind === 'overflow' && loaded && !error) body = <OverflowDetail data={data} advanceId={id ?? ''} bottom={insets.bottom} reload={reload} />;
  else if (error) body = <DetailNotice text={error} tone="error" />;
  else if (!loaded) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (!entry) body = <DetailNotice text="Không tìm thấy khoản này. Có thể nó đã bị xoá." tone="error" />;
  else {
    const fund = data.funds.find((item) => item.id === entry.fundId)?.name ?? 'Quỹ';
    const contribution = entry.kind === 'contribution' ? data.contribs.find((item) => item.id === entry.id) : undefined;
    const expense = entry.kind === 'expense' ? data.expenses.find((item) => item.id === entry.id) : undefined;
    const advance = entry.advanceId ? advanceById(data, entry.advanceId) : undefined;
    const debt = expense?.mode === 'personal' ? personalDebt(data, expense) : null;
    const advanceState = advance && (entry.kind === 'advance' || entry.kind === 'expense') ? ADVANCE_STATE_LABEL[advanceSummary(data, advance).state] : null;

    // Các dòng thông tin theo thứ tự hiển thị; dòng cuối bỏ đường kẻ dưới.
    const rows: { label: string; value: string }[] = [
      { label: 'Nội dung', value: entry.title },
      { label: 'Quỹ', value: fund },
      { label: 'Loại', value: KIND_LABEL[entry.kind] },
      { label: 'Ngày', value: formatVnDate(entry.date) },
    ];
    if (expense) rows.push({ label: 'Hình thức chi', value: expense.mode ? MODE_LABEL[expense.mode] : 'Quỹ chi trực tiếp' });
    if (entry.person) rows.push({ label: entry.kind === 'advance' ? 'Người nhận ứng' : entry.kind === 'expense' ? 'Người chi' : 'Người liên quan', value: entry.person });
    if (entry.split) {
      rows.push({ label: 'Quỹ chi', value: formatVnd(entry.split.fund) });
      rows.push({ label: 'Cá nhân ứng', value: formatVnd(entry.split.personal) });
    }
    if (debt) rows.push({ label: 'Thanh toán', value: personalDebtLabel(debt.state, debt.remaining, formatVnd, debt.paid) });
    if (advanceState) rows.push({ label: 'Hồ sơ ứng trước', value: advanceState });

    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <DetailHero amount={formatVnd(entry.amount)} />
        <Panel>
          {rows.map((row, index) => (
            <DetailField key={row.label} label={row.label} value={row.value} last={index === rows.length - 1} />
          ))}
        </Panel>
        {!!contribution && (
          <Panel>
            {contribution.people.map((person, index) => (
              <DetailField
                key={`${person.name}-${index}`}
                label={person.name || `Người ${index + 1}`}
                value={formatVnd(person.amount)}
                last={index === contribution.people.length - 1}
              />
            ))}
          </Panel>
        )}
        {/* Khoản giao ứng: các khoản chi từ chính lần giao đó; khoản chi từ ứng: mọi khoản A đã chi từ tiền ứng. Cùng dữ liệu và giao diện với trang Nợ quỹ. */}
        {entry.kind === 'advance' && advance && (
          <AdvanceSpendCard title={`Chi từ khoản giao ${advance.person} ứng`} items={advanceSpendItems(data, advance.fundId, advance.person, advance.id)} reload={reload} />
        )}
        {expense?.mode === 'advance' && advance && (
          <AdvanceSpendCard title={`Quỹ giao ${advance.person} ứng chi`} items={advanceSpendItems(data, advance.fundId, advance.person)} reload={reload} highlightId={expense.id} />
        )}
        <DetailNotice text="Sửa hoặc xoá khoản này: vuốt dòng sang trái ở Lịch sử quỹ." tone="info" />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết quỹ', headerShown: false }} />
      <ScreenTitle title="Chi tiết quỹ" topInset={insets.top} />
      {body}
    </View>
  );
}

/** Chi tiết khoản A chi VƯỢT số tiền được giao (quỹ nợ A): bảng tổng hợp vì sao nợ và các khoản đã chi. */
function OverflowDetail({ data, advanceId, bottom, reload }: { data: FundData; advanceId: string; bottom: number; reload: () => Promise<void> }) {
  const advance = advanceById(data, advanceId);
  if (!advance) return <DetailNotice text="Không tìm thấy khoản này. Có thể nó đã bị xoá." tone="error" />;
  const detail = buildPersonFundDetail(data, advance.fundId, advance.person);
  const fundName = data.funds.find((item) => item.id === advance.fundId)?.name ?? 'Quỹ';
  const sums = (data.advances ?? []).filter((item) => item.fundId === advance.fundId && item.person.trim() === advance.person.trim()).map((item) => advanceSummary(data, item));
  const owedNow = sums.reduce((total, item) => total + item.owed, 0);
  const paidExtra = sums.reduce((total, item) => total + item.paidExtra, 0);
  const rows = [
    { label: 'Người ứng', value: advance.person },
    { label: 'Quỹ', value: fundName },
    { label: 'Quỹ đã giao ứng', value: formatVnd(detail.given) },
    { label: 'Đã chi từ tiền ứng', value: formatVnd(detail.spentFromAdvance) },
    ...(detail.refunded > 0 ? [{ label: 'Đã hoàn lại quỹ', value: formatVnd(detail.refunded) }] : []),
    ...(paidExtra > 0 ? [{ label: 'Quỹ đã trả thêm', value: formatVnd(paidExtra) }] : []),
  ];
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + bottom }]}>
      <DetailHero amount={formatVnd(owedNow)} />
      <Panel>
        {rows.map((row, index) => (
          <DetailField key={row.label} label={row.label} value={row.value} last={index === rows.length - 1} />
        ))}
      </Panel>
      <DetailNotice
        text={`${advance.person} đã chi vượt số tiền được giao, nên quỹ nợ phần vượt ${formatVnd(owedNow)} (= đã chi − đã giao + đã hoàn − quỹ đã trả thêm).`}
        tone="info"
      />
      <AdvanceSpendCard title={`Quỹ giao ${advance.person} ứng chi`} items={advanceSpendItems(data, advance.fundId, advance.person)} reload={reload} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
});
