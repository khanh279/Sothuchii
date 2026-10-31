import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { AppText } from '@/components/app-text';
import { DetailField, DetailHero, DetailNotice } from '@/components/detail-parts';
import { PhotoSection } from '@/features/photos/PhotoViews';
import { Panel, ScreenTitle, SectionCard } from '@/components/design';
import { ADVANCE_STATE_LABEL, advanceById, advanceSummary, personalDebt, personalDebtLabel } from '@/domain/fundAdvance';
import { buildPersonFundDetail } from '@/domain/fundPerson';
import type { FundData } from '@/types/fund';
import { buildFundHistory, type FundHistoryEntry, type FundHistoryKind } from '@/domain/fundHistory';
import { AdvanceSpendCard, advanceSpendItems, lotSpendItems } from '@/features/funds/AdvanceSpendCard';
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
/** Tiêu đề trang theo loại dòng (ngắn gọn). */
const PAGE_TITLE: Record<string, string> = {
  contribution: 'Chi tiết thu quỹ',
  expense: 'Chi tiết khoản chi',
  advance: 'Chi tiết giao quỹ',
  refund: 'Chi tiết hoàn ứng',
  payout: 'Chi tiết quyết toán',
  overflow: 'Chi tiết chi vượt ứng',
};
const MODE_LABEL = { personal: 'Cá nhân ứng tiền túi', advance: 'Chi từ tiền ứng trước' } as const;

/**
 * Chi tiết MỘT dòng lịch sử quỹ (tham số route `kind` = loại dòng, `id` = mã), cùng kiểu giao diện với Chi tiết chi tiêu: thẻ "Số tiền", bảng các dòng
 * (quỹ, loại, ngày, nội dung và thông tin riêng của từng loại: người đóng, người chi / hình thức chi, nguồn tiền đã chia, trạng thái ứng trước) và dòng
 * ghi chú cuối trang. Chỉ xem; sửa / xoá bằng cách vuốt dòng ở Lịch sử quỹ.
 */
export default function FundEntryDetailScreen() {
  const { kind, id, ids } = useLocalSearchParams<{ kind?: string; id?: string; ids?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, loaded, error, reload } = useFundData();
  /** Chi tiết giao ứng: đang xổ danh sách các lần giao dưới dòng "Số tiền giao". */
  const [lotsOpen, setLotsOpen] = useState(false);

  const entry = useMemo<FundHistoryEntry | null>(() => {
    for (const day of buildFundHistory(data, 'all', { mode: 'all' }).days) {
      const found = day.entries.find((item) => item.kind === kind && item.id === id);
      if (found) return found;
    }
    return null;
  }, [data, kind, id]);

  /** Dòng "Giao A ứng" đã GỘP nhiều lần giao cùng ngày (tham số `ids`): các hồ sơ ứng, cũ → mới. */
  const merged = useMemo(() => {
    if (kind !== 'advance' || !ids) return [];
    return ids
      .split(',')
      .map((item) => advanceById(data, item))
      .filter((advance): advance is NonNullable<typeof advance> => !!advance)
      .sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  }, [data, kind, ids]);

  const who = entry?.person?.trim();
  const pageTitle = who && entry?.kind === 'advance' ? `Chi tiết giao ${who} ứng` : who && entry?.kind === 'payout' ? `Chi tiết ${who} ứng chi` : (PAGE_TITLE[kind ?? ''] ?? 'Chi tiết quỹ');

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
    /** Khoản chi từ tiền ứng: các phần chi (một khoản chi có thể được chia vào nhiều lần giao ứng, cùng ngày cùng nội dung được gộp), cũ → mới. */
    const spendParts =
      expense?.mode === 'advance'
        ? (ids ? ids.split(',') : [expense.id])
            .map((item) => data.expenses.find((candidate) => candidate.id === item))
            .filter((part): part is NonNullable<typeof part> => !!part && part.mode === 'advance')
            .sort((a, b) => {
              const da = (a.advanceId && advanceById(data, a.advanceId)?.date) || '';
              const db = (b.advanceId && advanceById(data, b.advanceId)?.date) || '';
              return da === db ? (a.id < b.id ? -1 : 1) : da < db ? -1 : 1;
            })
        : [];
    const spendTotal = spendParts.reduce((sum, part) => sum + part.amount, 0);
    const isMergedSpend = spendParts.length > 1;
    const debt = expense?.mode === 'personal' ? personalDebt(data, expense) : null;
    const advanceState = advance && (entry.kind === 'advance' || entry.kind === 'expense') ? ADVANCE_STATE_LABEL[advanceSummary(data, advance).state] : null;
    const isMerged = entry.kind === 'advance' && merged.length > 1;
    const mergedTotal = merged.reduce((sum, item) => sum + item.amount, 0);
    const mergedSpent = merged.reduce((sum, item) => sum + advanceSummary(data, item).spent, 0);

    // Các dòng thông tin theo thứ tự hiển thị; dòng cuối bỏ đường kẻ dưới.
    const rows: { label: string; value: string }[] = [
      ...(isMerged ? [] : [{ label: 'Nội dung', value: entry.title }]),
      { label: 'Quỹ', value: fund },
      {
        label: 'Loại',
        value: isMerged ? `Giao ứng (${merged.length} lần)` : KIND_LABEL[entry.kind],
      },
      { label: 'Ngày', value: formatVnDate(entry.date) },
    ];
    if (expense) rows.push({ label: 'Hình thức chi', value: expense.mode ? MODE_LABEL[expense.mode] : 'Quỹ chi trực tiếp' });
    if (entry.person) rows.push({ label: entry.kind === 'advance' ? 'Người nhận ứng' : entry.kind === 'expense' ? 'Người chi' : 'Người liên quan', value: entry.person });
    if (entry.split) {
      rows.push({ label: 'Quỹ chi', value: formatVnd(entry.split.fund) });
      rows.push({ label: 'Cá nhân ứng', value: formatVnd(entry.split.personal) });
    }
    if (debt) rows.push({ label: 'Thanh toán', value: personalDebtLabel(debt.state, debt.remaining, formatVnd, debt.paid) });
    if (isMerged) rows.push({ label: 'Đã chi', value: `${formatVnd(mergedSpent)} / ${formatVnd(mergedTotal)}` });
    else if (advanceState && !isMergedSpend) rows.push({ label: 'Hồ sơ ứng trước', value: advanceState });

    /** Chi tiết khoản GIAO ứng (một hoặc nhiều lần giao đã gộp): chỉ tổng số tiền giao, từng lần giao (ngày, tiền, đã chi / giao) và lịch sử chi. */
    const lots = entry.kind === 'advance' ? (merged.length > 0 ? merged : advance ? [advance] : []) : [];
    const lotIds = new Set(lots.map((item) => item.id));
    const lotRefunds = (data.txns ?? [])
      .filter((txn) => txn.kind === 'refund' && !!txn.advanceId && lotIds.has(txn.advanceId))
      .sort((x, y) => (x.date === y.date ? (x.id < y.id ? -1 : 1) : x.date < y.date ? -1 : 1));
    const lotsTotal = lots.reduce((sum, item) => sum + item.amount, 0);

    // Khoản chi từ tiền ứng: chỉ nội dung, ngày, số tiền (gọn); phần quan trọng là bảng "Giao ngày ..." bên dưới.
    /** Dòng "A ứng chi" (quỹ quyết toán cho cá nhân; có thể gộp nhiều lần trả cùng ngày): các khoản cá nhân ứng tiền trước và số quỹ đã quyết toán / còn lại. */
    const settlements =
      entry.kind === 'payout'
        ? [
            ...new Set(
              (ids ? ids.split(',') : [entry.id])
                .map((txnId) => (data.txns ?? []).find((txn) => txn.id === txnId)?.expenseId)
                .filter((expenseId): expenseId is string => !!expenseId),
            ),
          ]
            .map((expenseId) => data.expenses.find((candidate) => candidate.id === expenseId))
            .filter((item): item is NonNullable<typeof item> => !!item && item.mode === 'personal')
            .map((item) => ({ expense: item, debt: personalDebt(data, item) }))
        : [];
    const settleTotal = settlements.reduce((sum, item) => sum + item.debt.amount, 0);
    const settleIds = new Set(settlements.map((item) => item.expense.id));
    const settlePays = (data.txns ?? [])
      .filter((txn) => txn.kind === 'payout' && !!txn.expenseId && settleIds.has(txn.expenseId))
      .sort((x, y) => (x.date === y.date ? (x.id < y.id ? -1 : 1) : x.date < y.date ? -1 : 1));
    const settlePaid = settlements.reduce((sum, item) => sum + item.debt.paid, 0);
    const payoutView =
      settlements.length > 0 ? (
        <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
          <Panel>
            {settlements.map((item, index) => (
              <DetailField
                key={item.expense.id}
                label={item.expense.title || 'Chi quỹ'}
                value={formatVnd(item.debt.amount)}
                sub={formatVnDate(item.expense.date)}
                bold
                last={index === settlements.length - 1}
              />
            ))}
          </Panel>
          <SectionCard title="Quỹ quyết toán">
            {settlePays.map((txn) => (
              <DetailField key={txn.id} label={`Ngày ${formatVnDate(txn.date)}`} value={formatVnd(txn.amount)} />
            ))}
            <DetailField label="Còn lại" value={formatVnd(Math.max(0, settleTotal - settlePaid))} last />
          </SectionCard>
        </KeyboardAwareScrollView>
      ) : null;

    const shownRows =
      entry.kind === 'advance'
        ? []
        : spendParts.length > 0
          ? [
              { label: 'Nội dung', value: entry.title },
              { label: 'Ngày', value: formatVnDate(entry.date) },
              { label: 'Số tiền', value: formatVnd(spendTotal) },
            ]
          : rows;

    body = payoutView ?? (
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        {/* Khoản chi từ tiền ứng: gọn, không thẻ số tiền lớn; chỉ cho biết khoản này được chi từ những lần giao nào. */}
        {spendParts.length === 0 && entry.kind !== 'advance' && <DetailHero amount={formatVnd(entry.amount)} />}
        {/* Khoản giao ứng: một khung "Số tiền giao"; bấm vào mới xổ danh sách từng lần giao (ngày, số tiền, đã chi). */}
        {entry.kind === 'advance' && (
          <Panel>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: lotsOpen }} onPress={() => setLotsOpen((open) => !open)} style={styles.toggleRow}>
              <View style={styles.toggleField}>
                <DetailField label="Số tiền giao" value={formatVnd(lotsTotal)} last={!lotsOpen || lots.length === 0} />
              </View>
              <AppText color={colors.muted}>{lotsOpen ? '▴' : '▾'}</AppText>
            </Pressable>
            {lotsOpen &&
              lots.map((item, index) => (
                <DetailField
                  key={item.id}
                  label={`Giao ngày ${formatVnDate(item.date)}`}
                  value={formatVnd(item.amount)}
                  note={`Đã chi ${formatVnd(advanceSummary(data, item).spent)}`}
                  last={index === lots.length - 1}
                />
              ))}
          </Panel>
        )}
        {shownRows.length > 0 && (
          <Panel>
            {shownRows.map((row, index) => (
              <DetailField key={row.label} label={row.label} value={row.value} last={index === shownRows.length - 1} />
            ))}
          </Panel>
        )}
        {lots.length > 0 && entry.kind !== 'advance' && (
          <Panel>
            {lots.map((item, index) => (
              <DetailField
                key={item.id}
                label={`Giao ngày ${formatVnDate(item.date)}`}
                value={formatVnd(item.amount)}
                note={`Đã chi ${formatVnd(advanceSummary(data, item).spent)}`}
                last={index === lots.length - 1}
              />
            ))}
          </Panel>
        )}
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
          <AdvanceSpendCard
            title={`Chi từ khoản giao ${advance.person} ứng`}
            items={lotSpendItems(data, lots)}
            sourceDateOf={(id) => advanceById(data, id)?.date}
            reload={reload}
          />
        )}
        {entry.kind === 'advance' && lotRefunds.length > 0 && (
          <SectionCard title="Lịch sử hoàn tiền" rightTop={`${lotRefunds.length} lần`}>
            {lotRefunds.map((refund, index) => (
              <DetailField key={refund.id} label={`Ngày ${formatVnDate(refund.date)}`} value={formatVnd(refund.amount)} last={index === lotRefunds.length - 1} />
            ))}
          </SectionCard>
        )}
        {entry.kind === 'advance' && (
          <Panel>
            <DetailField label="Còn lại" value={formatVnd(lots.reduce((sum, item) => sum + advanceSummary(data, item).held, 0))} last />
          </Panel>
        )}
        {/* Khoản chi từ tiền ứng: KHÔNG liệt kê lại cả danh sách chi (sẽ thành vòng lặp trang giống hệt); chỉ nói khoản này đã trừ vào lần giao ứng nào. */}
        {spendParts.length > 0 && (
          <Panel>
            {spendParts.map((part, index) => {
              const source = part.advanceId ? advanceById(data, part.advanceId) : null;
              return (
                <DetailField
                  key={part.id}
                  label={source ? `Giao ngày ${formatVnDate(source.date)}` : 'Khoản giao ứng'}
                  value={source ? formatVnd(source.amount) : formatVnd(part.amount)}
                  note={`Đã chi ${formatVnd(part.amount)}`}
                  last={index === spendParts.length - 1}
                />
              );
            })}
          </Panel>
        )}
        {entry.kind === 'expense' && <PhotoSection ids={data.expenses.find((item) => item.id === entry.id)?.ph} />}
        <DetailNotice text="Vuốt dòng sang trái để sửa hoặc xóa" tone="info" />
      </KeyboardAwareScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết quỹ', headerShown: false }} />
      <ScreenTitle title={pageTitle} topInset={insets.top} />
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
    <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + bottom }]}>
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
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleField: { flex: 1 },
});
