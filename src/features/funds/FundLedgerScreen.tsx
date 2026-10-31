import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState, ScreenTitle, TitleAction, type StatusTone } from '@/components/design';
import { HistoryCard } from '@/components/history-card';
import { OptionSheet } from '@/components/option-sheet';
import { PeriodNote } from '@/components/period-filter';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteAdvanceSynced, deleteContributionSynced, deleteFundExpenseSynced, deleteFundTxnSynced } from '@/data/fundService';
import { dayHeading } from '@/domain/expenses';
import { ADVANCE_STATE_LABEL, advanceById, advanceSummary, type AdvanceState, personalDebt, personalDebtLabel, type PayState } from '@/domain/fundAdvance';
import { FUND_HISTORY_CATEGORIES, buildFundHistory, fundSpendBreakdown, filterDaysByCategory, mergePayoutEntries, type FundHistoryCategory, type FundHistoryEntry } from '@/domain/fundHistory';
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
 * Trang "Lịch sử quỹ" (mở từ nút "Lịch sử quỹ" ở trang một quỹ): các khoản ghi nhận của quỹ (thu, quỹ chi trực tiếp, cá nhân ứng chi, giao cá nhân chi, quỹ trả công nợ; không có các lần giao tiền ứng), gom theo ngày, lọc theo loại khoản bằng hàng nút
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
  /** Tờ chọn Thu quỹ / Chi tiêu quỹ của nút "+ Thu, chi quỹ"; đang xem một quỹ thì mở thẳng form của quỹ đó. */
  const [txnOpen, setTxnOpen] = useState(false);
  const fundParams = params.fund && params.fund !== 'all' ? { fund: params.fund } : {};
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

  // Lịch sử gồm thu, chi trực tiếp, cá nhân ứng chi và giao cá nhân chi (chi từ tiền giao). KHÔNG hiện các lần giao tiền ứng và các lần quỹ trả công nợ (thanh toán công nợ chỉ cập nhật trạng thái còn nợ / đã thanh toán của khoản gốc). Lọc theo loại khoản.
  const allDays = useMemo(() => history.days.map((day) => ({ ...day, entries: day.entries.filter((entry) => entry.kind !== 'advance' && entry.kind !== 'payout') })).filter((day) => day.entries.length > 0), [history.days]);
  const cashCount = allDays.reduce((total, day) => total + day.entries.length, 0);
  // Trong cùng một ngày, các lần quỹ trả cho cùng một khoản A ứng chi (cùng người, cùng nội dung) gộp thành một dòng.
  const shownDays = useMemo(() => mergePayoutEntries(filterDaysByCategory(allDays, category === 'all' ? null : category)), [allDays, category]);
  const shownCount = shownDays.reduce((total, day) => total + day.entries.length, 0);

  /**
   * Tóm tắt góc phải đầu thẻ theo danh sách đang xem: Tất cả → + thu, − chi; Thu quỹ → + thu; Quỹ chi trực tiếp → − chi; Cá nhân ứng chi → − chi và dòng dưới trạng thái quyết toán
   * (đã quyết toán / chưa quyết toán / còn nợ …); Giao cá nhân chi → − chi và dòng dưới tổng giao. Tính trên đúng các dòng đang hiện (đã lọc theo kỳ và loại).
   */
  const headSummary = useMemo(() => {
    let income = 0;
    let spent = 0;
    let owedAmount = 0;
    let owedRemaining = 0;
    for (const day of shownDays) {
      for (const entry of day.entries) {
        if (entry.kind === 'contribution') income += entry.amount;
        else if (entry.kind === 'expense') {
          spent += entry.amount;
          for (const id of entry.mergedIds ?? [entry.id]) {
            const expense = data.expenses.find((e) => e.id === id);
            if (!expense) continue;
            if (expense.mode === 'personal') {
              const debt = personalDebt(data, expense);
              owedAmount += debt.amount;
              owedRemaining += debt.remaining;
            }
          }
        }
      }
    }
    // Tổng giao: TẤT CẢ tiền quỹ giao cá nhân trong kỳ (kể cả lần giao chưa phát sinh chi), không chỉ những lần đã có khoản chi.
    const given = fundSpendBreakdown(data, history.filter === 'all' ? 'all' : history.filter, period).given;
    return { income, spent, owedAmount, owedRemaining, given };
  }, [shownDays, data, history.filter, period]);
  const headLine = (text: string, color: string, bold = true) => (
    <AppText weight={bold ? 'semibold' : 'regular'} color={color} style={styles.headLine} numberOfLines={1}>
      {text}
    </AppText>
  );
  const headRight =
    category === 'all' ? (
      <>
        {headLine(`+${formatVnd(headSummary.income)}`, colors.success)}
        {headLine(`−${formatVnd(headSummary.spent)}`, colors.danger)}
      </>
    ) : category === 'contribution' ? (
      headLine(`+${formatVnd(headSummary.income)}`, colors.success)
    ) : (
      <>
        {headLine(`−${formatVnd(headSummary.spent)}`, colors.danger)}
        {category === 'personal' &&
          headSummary.owedAmount > 0 &&
          (headSummary.owedRemaining <= 0
            ? headLine('Đã quyết toán', colors.success)
            : headSummary.owedRemaining >= headSummary.owedAmount
              ? headLine('Chưa quyết toán', colors.danger)
              : headLine(`Còn nợ ${formatVnd(headSummary.owedRemaining)}`, colors.warning))}
        {category === 'advanceSpend' && headLine(`Tổng giao ${formatVnd(headSummary.given)}`, colors.muted, false)}
      </>
    );

  /** Khoản cá nhân chi từ tiền quỹ giao: tổng tiền của (các) lần giao mà khoản chi này thuộc về, đã trừ các khoản hoàn tiền, dòng trạng thái "Tổng giao …" dưới số tiền. */
  function givenTotal(entry: FundHistoryEntry): number {
    const advanceIds = new Set((entry.mergedIds ?? [entry.id]).map((id) => data.expenses.find((e) => e.id === id)?.advanceId).filter((id): id is string => !!id));
    // Đã hoàn lại bao nhiêu thì tổng giao giảm bấy nhiêu (tiền hoàn trừ thẳng vào lần giao).
    return [...advanceIds].reduce((sum, id) => {
      const advance = advanceById(data, id);
      return advance ? sum + advance.amount - advanceSummary(data, advance).refunded : sum;
    }, 0);
  }

  /** Nhãn trạng thái của một dòng: khoản cá nhân ứng → trạng thái thanh toán; dòng thuộc hồ sơ ứng trước → trạng thái quyết toán. */
  function statusOf(entry: FundHistoryEntry): { label: string; tone: StatusTone } | null {
    if (entry.kind === 'expense') {
      const expense = data.expenses.find((e) => e.id === entry.id);
      if (expense?.mode === 'personal') {
        const debt = personalDebt(data, expense);
        // Chưa thanh toán chút nào: "Chưa quyết toán" (đỏ); trả một phần: "Còn nợ <số còn lại>" (cam); trả đủ: "Đã quyết toán" (xanh).
        const tone: Record<PayState, StatusTone> = { paid: 'get', partial: 'warn', unpaid: 'owe' };
        const label = debt.state === 'unpaid' ? ADVANCE_STATE_LABEL.unsettled : personalDebtLabel(debt.state === 'partial' ? 'unpaid' : debt.state, debt.remaining, formatVnd);
        return { label, tone: tone[debt.state] };
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
    // Khoản cá nhân chi từ tiền quỹ giao: dòng trạng thái dưới số tiền ghi tổng tiền của (các) lần giao.
    if (entry.kind === 'expense' && entry.spendFromAdvance) return { label: `Tổng giao ${formatVnd(givenTotal(entry))}`, tone: 'info' };
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
      <ScreenTitle title="Lịch sử quỹ" topInset={insets.top} right={<TitleAction label="Thu, chi quỹ" onPress={() => setTxnOpen(true)} />} />
      {txnOpen && (
        <OptionSheet
          title="Thu, chi quỹ"
          onClose={() => setTxnOpen(false)}
          options={[
            { icon: 'wallet', label: 'Thu quỹ', onPress: () => router.push({ pathname: '/quy/thu-quy', params: fundParams }) },
            { icon: 'people', label: 'Chi tiêu quỹ', onPress: () => router.push({ pathname: '/quy/chi-tieu', params: fundParams }) },
          ]}
        />
      )}
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
                rightBottom={<View style={styles.headRight}>{headRight}</View>}
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
                  text={category !== 'all' && cashCount > 0 ? 'Không có khoản nào thuộc loại này trong khoảng này' : 'Không có khoản nào trong khoảng này'}
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
                                ? `${name ? `${name} · ` : ''}${entry.person ? `${entry.person} ứng chi` : 'Cá nhân ứng chi'}: ${formatVnd(entry.split.personal)}`
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
  // Cao cố định (đủ ba dòng bên phải) để hàng chip bên dưới luôn nằm đúng một vị trí, dù đang xem loại nào.
  cardHead: { height: 72, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  headRight: { alignItems: 'flex-end' },
  headLine: { fontSize: 12, lineHeight: 16 },
  body: { paddingHorizontal: 12, paddingBottom: 8 },
  day: {},
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, marginTop: 8, marginBottom: 4 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
