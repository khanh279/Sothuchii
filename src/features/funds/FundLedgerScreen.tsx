import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState, ScreenTitle, type StatusTone } from '@/components/design';
import { HistoryCard } from '@/components/history-card';
import { PeriodNote } from '@/components/period-filter';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteAdvanceSynced, deleteContributionSynced, deleteFundExpenseSynced, deleteFundTxnSynced } from '@/data/fundService';
import { dayHeading } from '@/domain/expenses';
import { ADVANCE_STATE_LABEL, advanceById, advanceSummary, type AdvanceState, personalDebt, personalDebtLabel, type PayState } from '@/domain/fundAdvance';
import { FUND_HISTORY_CATEGORIES, buildFundHistory, filterCashMovementDays, filterDaysByCategory, mergePayoutEntries, type FundHistoryCategory, type FundHistoryEntry } from '@/domain/fundHistory';
import { FundEntryIcon } from '@/features/funds/FundEntryIcon';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';
import { router } from '@/utils/safe-router';

/** Màu nhãn trạng thái quyết toán của hồ sơ ứng trước (đã quyết toán xanh, một phần cam, chưa quyết toán đỏ). */
const ADVANCE_TONE: Record<AdvanceState, StatusTone> = { settled: 'get', partial: 'warn', unsettled: 'owe' };

const CATEGORY_OPTIONS = [{ value: 'all' as const, label: 'Tất cả' }, ...FUND_HISTORY_CATEGORIES];

/**
 * Trang "Lịch sử quỹ" (mở từ nút "Lịch sử quỹ" ở trang một quỹ): CHỈ các khoản làm đổi số dư thực tế của quỹ (`filterCashMovementDays`), gom theo ngày, lọc theo loại khoản bằng hàng nút
 * (Tất cả, thu quỹ, quỹ chi trực tiếp, cá nhân ứng chi, giao tiền ứng trước…), vuốt dòng để Sửa / Xoá, chạm để xem chi tiết. Tiêu đề nhỏ của thẻ = tên chip đang chọn; kỳ là kỳ dùng chung,
 * đổi bằng cách bấm ghi chú ngày dưới tiêu đề nhỏ. Tham số route: `fund` (`all` hoặc id quỹ).
 */
export default function FundLedgerScreen() {
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

  // Lịch sử chỉ gồm khoản làm đổi số dư thực tế của quỹ; lọc theo loại khoản.
  const cashDays = useMemo(() => filterCashMovementDays(history.days, data), [history.days, data]);
  const cashCount = cashDays.reduce((total, day) => total + day.entries.length, 0);
  // Trong cùng một ngày, các lần quỹ trả cho cùng một khoản A ứng chi (cùng người, cùng nội dung) gộp thành một dòng.
  const shownDays = useMemo(() => mergePayoutEntries(filterDaysByCategory(cashDays, category === 'all' ? null : category)), [cashDays, category]);
  const shownCount = shownDays.reduce((total, day) => total + day.entries.length, 0);

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
      <Stack.Screen options={{ title: 'Lịch sử quỹ', headerShown: false }} />
      <ScreenTitle title="Lịch sử quỹ" topInset={insets.top} />
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
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardHead}>
              <CardHead
                title={CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? 'Tất cả'}
                subtitleNode={<PeriodNote view={view} onChange={setView} today={today} />}
                rightTop={`${shownCount} khoản`}
              />
            </View>
            <View style={styles.body}>
              <ChipRow
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(next) => {
                  setOpenId(null);
                  setCategory(next);
                }}
              />

              {shownDays.length === 0 ? (
                <EmptyState
                  text={category !== 'all' && cashCount > 0 ? 'Không có khoản nào thuộc loại này trong khoảng này' : 'Không có khoản nào làm đổi số dư quỹ trong khoảng này'}
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
                            singleLineSubtitle={!!entry.split}
                            subtitle={
                              entry.split
                                ? `${name ? `${name} · ` : ''}${entry.person ? `${entry.person} ứng` : 'Cá nhân ứng'}: ${formatVnd(entry.split.personal)}`
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden' },
  cardHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  body: { paddingHorizontal: 12, paddingBottom: 8 },
  day: {},
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, marginTop: 8, marginBottom: 4 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
