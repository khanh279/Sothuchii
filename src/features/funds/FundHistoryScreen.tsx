import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState, ScreenTitle, SectionCard, type StatusTone } from '@/components/design';
import { HistoryCard } from '@/components/history-card';
import { PeriodFilter } from '@/components/period-filter';
import { SelectableCard } from '@/components/selectable-card';
import { SvgIcon } from '@/components/svg-icon';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteAdvanceSynced, deleteContributionSynced, deleteFundExpenseSynced, deleteFundTxnSynced } from '@/data/fundService';
import { dayHeading, periodTitle } from '@/domain/expenses';
import {
  ADVANCE_STATE_LABEL,
  advanceById,
  advanceSummary,
  type AdvanceState,
  fundPersonBalances,
  fundPosition,
  personalDebt,
  personalDebtLabel,
  type PayState,
} from '@/domain/fundAdvance';
import { FUND_HISTORY_CATEGORIES, buildFundHistory, filterCashMovementDays, filterDaysByCategory, mergePayoutEntries, type FundHistoryCategory, type FundHistoryEntry } from '@/domain/fundHistory';
import { FundEntryIcon } from '@/features/funds/FundEntryIcon';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Màu thu / chi của Quỹ (`--in`, `--out` của PWA). */

/**
 * Trang một quỹ nhóm (hoặc tất cả quỹ) gồm BA thẻ: (1) Tổng quan: thu, chi trong kỳ chọn, số dư và tiền thực tế; (2) Công nợ quỹ: từng người quỹ đang nợ / đang giữ ứng,
 * chạm một người để mở trang chi tiết công nợ của người đó (các khoản ứng, chi và Thanh toán); (3) Lịch sử quỹ: CHỈ các khoản làm đổi số dư thực tế của quỹ (`filterCashMovementDays`), gom theo ngày,
 * vuốt dòng để Sửa / Xoá, chạm để xem chi tiết. Kỳ là kỳ dùng chung (ô chọn thời gian ở đầu trang). Tham số route: `fund` (`all` hoặc id quỹ).
 */
/** Màu nhãn trạng thái quyết toán của hồ sơ ứng trước (đã quyết toán xanh, một phần cam, chưa quyết toán đỏ). */
const ADVANCE_TONE: Record<AdvanceState, StatusTone> = { settled: 'get', partial: 'warn', unsettled: 'owe' };

export default function FundHistoryScreen() {
  const params = useLocalSearchParams<{ fund?: string }>();
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { view, setView, period } = useSharedPeriod();

  const { data, loaded, error, reload } = useFundData();
  const [openId, setOpenId] = useState<string | null>(null);
  /** Loại khoản đang lọc; 'all' = Tất cả (mặc định). */
  const [category, setCategory] = useState<FundHistoryCategory | 'all'>('all');

  const history = useMemo(() => buildFundHistory(data, params.fund || 'all', period), [data, params.fund, period]);
  const single = history.filter !== 'all' ? history.funds[0] : null;
  const fundName = (id: string) => data.funds.find((fund) => fund.id === id)?.name ?? '';

  async function remove(entry: FundHistoryEntry) {
    try {
      if (entry.kind === 'contribution') await deleteContributionSynced(entry.id);
      else if (entry.kind === 'expense') for (const id of entry.mergedIds ?? [entry.id]) await deleteFundExpenseSynced(id);
      else if (entry.kind === 'advance') for (const id of entry.mergedIds ?? [entry.id]) await deleteAdvanceSynced(id);
      else for (const id of entry.mergedIds ?? [entry.id]) await deleteFundTxnSynced(id);
      setOpenId(null);
      toast.show(entry.kind === 'contribution' ? 'Đã xóa lần đóng quỹ' : entry.kind === 'expense' ? 'Đã xóa khoản chi' : 'Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeFundError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  const position = fundPosition(data, history.filter === 'all' ? 'all' : history.filter);
  const balances = fundPersonBalances(data, history.filter === 'all' ? 'all' : history.filter);
  /** Mỗi khoản một hàng: "Quỹ nợ" (quỹ nợ người đó, đỏ) hoặc "Nợ quỹ" (người đó đang giữ tiền ứng của quỹ, cam); một người có cả hai thì có hai hàng. */
  const debtRows = balances.flatMap((item) => [
    ...(item.owed > 0 ? [{ person: item.person, kind: 'owed' as const, amount: item.owed }] : []),
    ...(item.held > 0 ? [{ person: item.person, kind: 'held' as const, amount: item.held }] : []),
  ]);
  // Lịch sử chỉ gồm khoản làm đổi số dư thực tế của quỹ; lọc theo loại khoản (thu quỹ, quỹ chi trực tiếp, cá nhân ứng chi, giao tiền ứng trước).
  const cashDays = useMemo(() => filterCashMovementDays(history.days, data), [history.days, data]);
  const cashCount = cashDays.reduce((total, day) => total + day.entries.length, 0);
  // Trong cùng một ngày, các lần quỹ trả cho cùng một khoản A ứng chi (cùng người, cùng nội dung) gộp thành một dòng.
  const shownDays = useMemo(() => mergePayoutEntries(filterDaysByCategory(cashDays, category === 'all' ? null : category)), [cashDays, category]);

  /** Nhãn trạng thái của một dòng: khoản cá nhân ứng → trạng thái thanh toán; dòng thuộc hồ sơ ứng trước → trạng thái quyết toán. */
  function statusOf(entry: FundHistoryEntry): { label: string; tone: StatusTone } | null {
    if (entry.kind === 'expense') {
      const expense = data.expenses.find((e) => e.id === entry.id);
      if (expense?.mode === 'personal') {
        const debt = personalDebt(data, expense);
        const tone: Record<PayState, StatusTone> = { paid: 'get', partial: 'warn', unpaid: 'owe' };
        return { label: personalDebtLabel(debt.state, debt.remaining, formatVnd, debt.paid), tone: tone[debt.state] };
      }
    }
    // Dòng quỹ trả cá nhân: khoản A ứng chi gốc đã được quỹ trả xong thì hiện "Đã quyết toán" màu xanh, chưa xong thì ghi chú "Một phần".
    if (entry.kind === 'payout') {
      const ids = entry.expenseIds ?? (entry.expenseId ? [entry.expenseId] : []);
      const paid =
        ids.length > 0 &&
        ids.every((id) => {
          const expense = data.expenses.find((e) => e.id === id);
          return expense?.mode === 'personal' && personalDebt(data, expense).state === 'paid';
        });
      if (paid) return { label: 'Đã quyết toán', tone: 'get' };
      if (ids.length > 0) return { label: 'Quyết toán một phần', tone: 'warn' };
    }
    // Dòng giao tiền ứng: trạng thái CHI của lần giao (chi hết xanh / chi một phần cam / chưa chi đỏ).
    // Dòng đã gộp (nhiều lần giao cùng ngày): tính trên TỔNG; vì tiền chi vào lần giao cũ nhất trước nên lần cũ "chi hết", lần mới "một phần" gộp thành "Chi một phần".
    if (entry.kind === 'advance' && entry.advanceId) {
      const advances = (entry.mergedIds ?? [entry.advanceId]).map((id) => advanceById(data, id)).filter((advance): advance is NonNullable<typeof advance> => !!advance);
      if (advances.length) {
        const given = advances.reduce((sum, advance) => sum + advance.amount, 0);
        const spent = advances.reduce((sum, advance) => sum + advanceSummary(data, advance).spent, 0);
        if (given > 0 && spent >= given) return { label: 'Đã chi hết', tone: 'get' };
        // Theo số đã chi THỰC TẾ của lần giao tại thời điểm hiện tại (sau phân bổ lại): chưa chi đồng nào = "Chưa chi".
        return spent > 0 ? { label: 'Chi một phần', tone: 'warn' } : { label: 'Chưa chi', tone: 'owe' };
      }
    }
    // Khoản chi từ tiền ứng ("Quỹ giao A ứng chi"): chỉ là dòng chi để xem, như ô lịch sử ở trang Nợ quỹ, không nhãn trạng thái.
    if (entry.kind === 'expense' && entry.spendFromAdvance) return null;
    if (entry.advanceId && entry.kind === 'expense') {
      const advance = advanceById(data, entry.advanceId);
      if (advance) {
        const state = advanceSummary(data, advance).state;
        return { label: ADVANCE_STATE_LABEL[state], tone: ADVANCE_TONE[state] };
      }
    }
    return null;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Quỹ nhóm', headerShown: false }} />
      <ScreenTitle title={single ? single.name : 'Chi tiêu quỹ'} topInset={insets.top} right={<PeriodFilter compact view={view} onChange={setView} today={today} />} />
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <LockableScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} onScrollBeginDrag={() => setOpenId(null)}>
          <SectionCard title="Tổng quan" subtitle={periodTitle(period)} rightTop={single ? undefined : `${history.funds.length} quỹ`}>
            <View>
              <InfoRow label="Thu trong kỳ" value={`+${formatVnd(history.totalIn)}`} color={colors.success} first />
              <InfoRow label="Chi trong kỳ" value={`−${formatVnd(history.totalOut)}`} color={colors.danger} />
              <InfoRow label={single ? `Số dư ${single.name}` : 'Số dư các quỹ'} value={formatVnd(history.balance)} color={history.balance < 0 ? colors.danger : undefined} bold />
              {position.advanced && <InfoRow label="Tiền thực tế trong quỹ" value={formatVnd(position.cash)} />}
            </View>
          </SectionCard>

          <SectionCard title="Công nợ quỹ" subtitle="Toàn thời gian" rightTop={debtRows.length > 0 ? `${debtRows.length} khoản` : undefined}>
            {balances.length === 0 ? (
              <EmptyState text="Không có khoản nợ hay tiền ứng nào chưa xử lý" icon="check" />
            ) : (
              <View style={styles.debtSections}>
                {(['owed', 'held'] as const).map((kind) => {
                  const rows = debtRows.filter((row) => row.kind === kind);
                  if (rows.length === 0) return null;
                  const tint = kind === 'owed' ? colors.danger : colors.warning;
                  const label = kind === 'owed' ? 'Quỹ nợ' : 'Nợ quỹ';
                  return (
                    <View key={kind} style={styles.debtSection}>
                      <View style={styles.debtSectionHead}>
                        <AppText weight="semibold" color={colors.muted} style={styles.debtSectionTitle}>
                          {label}
                        </AppText>
                        <AppText color={colors.muted} style={styles.debtSectionTitle}>
                          {rows.length} người
                        </AppText>
                      </View>
                      <View style={styles.debtList}>
                        {rows.map((row) => (
                          <SelectableCard
                            key={`${row.person}:${row.kind}`}
                            selected={false}
                            onPress={() => router.push({ pathname: '/quy/cong-no', params: { person: row.person, fund: history.filter, side: row.kind } })}
                            accessibilityLabel={`${row.person}: ${label} ${formatVnd(row.amount)}`}
                          >
                            <View style={styles.debtRow}>
                              <AppText weight="semibold" style={[styles.rowText, styles.rowName]} numberOfLines={1}>
                                {row.person}
                              </AppText>
                              <AppText weight="bold" color={tint} style={styles.debtAmount}>
                                {formatVnd(row.amount)}
                              </AppText>
                              <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
                            </View>
                          </SelectableCard>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </SectionCard>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardHead}>
              <CardHead title="Lịch sử quỹ" subtitle={periodTitle(period)} rightTop={`${cashCount} khoản`} />
            </View>
            <View style={styles.body}>
              <ChipRow
                options={[{ value: 'all' as const, label: 'Tất cả' }, ...FUND_HISTORY_CATEGORIES]}
                value={category}
                onChange={(next) => {
                  setOpenId(null);
                  setCategory(next);
                }}
              />

              {shownDays.length === 0 ? (
                <EmptyState
                  text={category !== 'all' ? 'Không có khoản nào thuộc loại này trong khoảng này' : 'Không có khoản nào làm đổi số dư quỹ trong khoảng này'}
                  icon="check"
                />
              ) : (
                shownDays.map((day) => (
                  <View key={day.date} style={styles.day}>
                    <View style={styles.dayHeader}>
                      <AppText color={colors.muted} style={styles.dayName} numberOfLines={1}>
                        <AppText weight="semibold" style={styles.dayName}>
                          {dayHeading(day.date, today)}
                        </AppText>
                        , {formatVnDate(day.date)}
                      </AppText>
                      <AppText color={colors.muted} style={styles.dayName}>
                        {day.entries.length} khoản
                      </AppText>
                    </View>
                    <View style={styles.rows}>
                      {day.entries.map((entry) => {
                        const incoming = entry.kind === 'contribution' || entry.kind === 'refund';
                        const cashOnly = entry.kind === 'advance' || entry.kind === 'payout' || entry.kind === 'refund'; // dòng tiền, không phải chi phí
                        const status = statusOf(entry);
                        const name = history.showFundName ? fundName(entry.fundId) : '';
                        return (
                          <HistoryCard
                            key={`${entry.kind}:${entry.id}`}
                            open={openId === entry.id}
                            onOpen={() => setOpenId(entry.id)}
                            onClose={() => setOpenId((current) => (current === entry.id ? null : current))}
                            onPressRow={() => {
                              setOpenId(null);
                              router.push({
                                pathname: '/quy/chi-tiet',
                                params: {
                                  kind: entry.kind,
                                  id: entry.id,
                                  ...((entry.kind === 'advance' || entry.kind === 'payout' || entry.spendFromAdvance) && (entry.mergedIds?.length ?? 0) > 1
                                    ? { ids: entry.mergedIds!.join(',') }
                                    : {}),
                                },
                              });
                            }}
                            onEdit={() => {
                              setOpenId(null);
                              router.push({ pathname: '/quy/sua', params: { kind: entry.kind, id: entry.id } });
                            }}
                            onDelete={() => void remove(entry)}
                            accessibilityLabel={`${entry.title}, ${incoming ? '+' : '-'}${formatVnd(entry.amount)}`}
                            icon={<FundEntryIcon kind={entry.kind} mode={data.expenses.find((e) => e.id === entry.id)?.mode} />}
                            title={entry.title}
                            subtitle={
                              entry.split
                                ? `${name ? `${name} · ` : ''}Quỹ chi: ${formatVnd(entry.split.fund)}\nCá nhân ứng${entry.person ? ` (${entry.person})` : ''}: ${formatVnd(entry.split.personal)}`
                                : name
                                  ? `${name} · ${entry.meta}`
                                  : entry.meta
                            }
                            amount={`${incoming ? '+' : '−'}${formatVnd(entry.amount)}`}
                            tone={cashOnly && !incoming ? 'mid' : incoming ? 'get' : 'owe'}
                            badge={status?.label}
                            badgeTone={status?.tone}
                          />
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </LockableScrollView>
      )}
    </View>
  );
}

/** Dòng nhãn – giá trị của thẻ Tổng quan và chi tiết công nợ: nhãn xám bên trái, giá trị đậm (có thể tô màu) bên phải, ngăn bằng đường mảnh. */
function InfoRow({ label, value, color, bold, first }: { label: string; value: string; color?: string; bold?: boolean; first?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.infoRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <AppText color={colors.muted} style={styles.infoLabel}>
        {label}
      </AppText>
      <AppText weight={bold ? 'bold' : 'semibold'} color={color} style={styles.infoValue}>
        {value}
      </AppText>
    </View>
  );
}

// Số đo theo CSS `.mod-b` của PWA: thẻ bo 16 viền 1; tóm tắt cao 64; dòng cao 64, bo 14, biểu tượng 40×40 bo 12.
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden' },
  cardHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  body: { paddingHorizontal: 12, paddingBottom: 8 },
  infoRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { flexShrink: 1, fontSize: 14 },
  infoValue: { fontSize: 15, textAlign: 'right' },
  debtSections: { gap: 14 },
  debtSection: { gap: 6 },
  debtSectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  debtSectionTitle: { fontSize: 13, lineHeight: 18 },
  debtList: { gap: 8 },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** Cùng khuôn với danh sách Thanh toán bill (Chia bill) và Chi tiết nợ (Công nợ): tên cùng chiều cao dòng với số tiền. */
  rowName: { fontSize: 15.5, lineHeight: 23 },
  debtAmount: { fontSize: 17, lineHeight: 23 },
  debtDetail: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  debtItemsTitle: { fontSize: 13.5, marginTop: 8 },
  debtItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  debtItemTitle: { fontSize: 14, lineHeight: 19 },
  debtItemSub: { fontSize: 12, lineHeight: 16 },
  debtItemAmount: { fontSize: 14.5 },
  empty: { textAlign: 'center', fontSize: 15, paddingVertical: 28 },
  day: {},
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, marginTop: 8, marginBottom: 4 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
  row: { minHeight: 64, paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22, lineHeight: 26 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15.5, lineHeight: 19.4 },
  rowSub: { fontSize: 12.5, lineHeight: 16 },
  rowAmount: { fontSize: 16, lineHeight: 23 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%' },
  sheetContent: { padding: 16, gap: 12 },
  close: { alignSelf: 'flex-end', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24 },
});
