import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, ModalHeader, type StatusTone } from '@/components/design';
import { HistoryCard, IconTile } from '@/components/history-card';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteAdvanceSynced, deleteContributionSynced, deleteFundExpenseSynced, deleteFundTxnSynced } from '@/data/fundService';
import { dayHeading, periodFromParams, periodTitle } from '@/domain/expenses';
import { ADVANCE_STATE_LABEL, PAY_STATE_LABEL, advanceById, advanceSummary, fundPersonBalances, fundPosition, personalDebt, type PayState } from '@/domain/fundAdvance';
import { buildFundHistory, filterDaysByPerson, type FundHistoryEntry } from '@/domain/fundHistory';
import { FundActionSheet, type FundActionTarget } from '@/features/funds/FundActionSheet';
import { ADVANCE_TONE } from '@/features/funds/FundAdvanceScreen';
import { ContributionForm } from '@/features/funds/ContributionForm';
import { FundExpenseForm } from '@/features/funds/FundExpenseForm';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { fundBalance } from '@/domain/funds';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Màu thu / chi của Quỹ (`--in`, `--out` của PWA). */

/**
 * Lịch sử Quỹ nhóm trong một kỳ: số dư, rồi các lần đóng, khoản chi thực tế và dòng tiền ứng trước (giao tiền ứng, hoàn tiền, quỹ trả cá nhân) gom theo ngày.
 * Vuốt dòng để Sửa / Xoá. Khoản cá nhân ứng hiện trạng thái thanh toán (chạm để ghi nhận quỹ trả); dòng thuộc hồ sơ ứng trước chạm để mở chi tiết hồ sơ.
 * Tham số route: kỳ (`mode`, `month`, `year`, `from`, `to`) và `fund` (`all` hoặc id quỹ, như bấm một quỹ ở Tổng quan).
 */
export default function FundHistoryScreen() {
  const params = useLocalSearchParams<{ mode?: string; month?: string; year?: string; from?: string; to?: string; fund?: string }>();
  const { mode, month, year, from, to } = params;
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const period = useMemo(() => periodFromParams({ mode, month, year, from, to }, today), [mode, month, year, from, to, today]);

  const { data, loaded, error, reload } = useFundData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FundHistoryEntry | null>(null);
  const [action, setAction] = useState<FundActionTarget | null>(null);
  /** Lọc lịch sử theo một người (bấm một dòng ở mục Công nợ quỹ); rỗng = xem tất cả. */
  const [personFilter, setPersonFilter] = useState('');

  const history = useMemo(() => buildFundHistory(data, params.fund || 'all', period), [data, params.fund, period]);
  const single = history.filter !== 'all' ? history.funds[0] : null;
  const fundName = (id: string) => data.funds.find((fund) => fund.id === id)?.name ?? '';

  async function remove(entry: FundHistoryEntry) {
    try {
      if (entry.kind === 'contribution') await deleteContributionSynced(entry.id);
      else if (entry.kind === 'expense') await deleteFundExpenseSynced(entry.id);
      else if (entry.kind === 'advance') await deleteAdvanceSynced(entry.id);
      else await deleteFundTxnSynced(entry.id);
      setOpenId(null);
      toast.show(entry.kind === 'contribution' ? 'Đã xóa lần đóng quỹ' : entry.kind === 'expense' ? 'Đã xóa khoản chi' : 'Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeFundError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  const editingContribution = editing?.kind === 'contribution' ? data.contribs.find((c) => c.id === editing.id) : undefined;
  const editingExpense = editing?.kind === 'expense' ? data.expenses.find((e) => e.id === editing.id) : undefined;
  const editingFund = editing ? data.funds.find((fund) => fund.id === editing.fundId) : undefined;
  const position = fundPosition(data, history.filter === 'all' ? 'all' : history.filter);
  const balances = fundPersonBalances(data, history.filter === 'all' ? 'all' : history.filter);
  // Người đang lọc mà không còn công nợ nào (vừa thanh toán xong) vẫn lọc được cho tới khi bỏ lọc; chỉ đổi cách hiển thị, không đổi dữ liệu.
  const shownDays = filterDaysByPerson(history.days, personFilter);

  const openAdvance = (advanceId?: string) => advanceId && router.push({ pathname: '/quy/ung-truoc', params: { id: advanceId } });

  /** Nhãn trạng thái của một dòng: khoản cá nhân ứng → trạng thái thanh toán; dòng thuộc hồ sơ ứng trước → trạng thái quyết toán. */
  function statusOf(entry: FundHistoryEntry): { label: string; tone: StatusTone } | null {
    if (entry.kind === 'expense') {
      const expense = data.expenses.find((e) => e.id === entry.id);
      if (expense?.mode === 'personal') {
        const debt = personalDebt(data, expense);
        const tone: Record<PayState, StatusTone> = { paid: 'get', partial: 'warn', unpaid: 'owe' };
        const label = debt.state === 'paid' ? PAY_STATE_LABEL.paid : `${PAY_STATE_LABEL[debt.state]} · còn nợ ${formatVnd(debt.remaining)}`;
        return { label, tone: tone[debt.state] };
      }
    }
    if (entry.advanceId && (entry.kind === 'advance' || entry.kind === 'expense')) {
      const advance = advanceById(data, entry.advanceId);
      if (advance) {
        const state = advanceSummary(data, advance).state;
        return { label: ADVANCE_STATE_LABEL[state], tone: ADVANCE_TONE[state] };
      }
    }
    return null;
  }

  function pressEntry(entry: FundHistoryEntry) {
    setOpenId(null);
    if (entry.kind === 'expense') {
      const expense = data.expenses.find((e) => e.id === entry.id);
      if (expense?.mode === 'personal') {
        const debt = personalDebt(data, expense);
        if (debt.remaining > 0) setAction({ mode: 'payout', expenseId: expense.id, person: expense.payer ?? '', max: debt.remaining });
        return;
      }
    }
    openAdvance(entry.advanceId);
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Lịch sử quỹ', headerShown: false }} />
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} onScrollBeginDrag={() => setOpenId(null)}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <AppText weight="semibold" style={styles.summaryTitle} numberOfLines={1}>
                  {single ? single.name : 'Chi tiêu quỹ'}
                </AppText>
                <AppText weight="medium" color={colors.muted} style={styles.summaryPeriod}>
                  {periodTitle(period)}
                </AppText>
              </View>
              <View style={styles.summaryRight}>
                <AppText weight="semibold" color={colors.muted} style={styles.summaryCount}>
                  {single ? `${history.count} khoản` : `${history.funds.length} quỹ`}
                </AppText>
                <AppText weight="medium" style={styles.summaryAmount}>
                  <AppText color={colors.success} style={styles.summaryAmount}>
                    +{formatVnd(history.totalIn)}
                  </AppText>
                  <AppText color={colors.danger} style={styles.summaryAmount}>
                    {'  '}−{formatVnd(history.totalOut)}
                  </AppText>
                </AppText>
              </View>
            </View>

            <View style={styles.body}>
              {data.funds.length > 0 && (
                <View style={[styles.balance, { backgroundColor: colors.bg }]}>
                  <AppText color={colors.muted} style={styles.balanceLabel}>
                    {single ? `Số dư ${single.name}` : 'Số dư các quỹ'}
                  </AppText>
                  <AppText weight="bold" color={history.balance < 0 ? colors.danger : colors.success} style={styles.balanceValue}>
                    {formatVnd(history.balance)}
                  </AppText>
                </View>
              )}
              {data.funds.length > 0 && position.advanced && (
                <View style={[styles.balance, styles.position, { backgroundColor: colors.bg }]}>
                  <PositionRow label="Tiền thực tế trong quỹ" value={formatVnd(position.cash)} />
                  <PositionRow label="Cá nhân đang giữ tiền ứng" value={formatVnd(position.held)} color={position.held > 0 ? colors.warning : undefined} />
                  <PositionRow label="Quỹ nợ cá nhân" value={formatVnd(position.owed)} color={position.owed > 0 ? colors.danger : undefined} />
                </View>
              )}
              {data.funds.length > 0 && position.advanced && (
                <View style={[styles.balance, styles.position, { backgroundColor: colors.bg }]}>
                  <AppText weight="semibold" style={styles.debtTitle} accessibilityRole="header">
                    Công nợ quỹ
                  </AppText>
                  {balances.length === 0 ? (
                    <AppText color={colors.muted} style={styles.balanceLabel}>
                      Không có khoản nợ hay tiền ứng nào chưa xử lý.
                    </AppText>
                  ) : (
                    balances.map((item) => {
                      const selected = personFilter === item.person;
                      return (
                        <Pressable
                          key={item.person}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${item.person}: ${item.owed > 0 ? `quỹ nợ ${formatVnd(item.owed)}` : ''} ${item.held > 0 ? `đang giữ tiền ứng ${formatVnd(item.held)}` : ''}`}
                          onPress={() => {
                            setOpenId(null);
                            setPersonFilter(selected ? '' : item.person);
                          }}
                          style={[styles.debtRow, { backgroundColor: selected ? colors.primarySoft : colors.surface, borderColor: selected ? colors.primary : colors.line }]}>
                          <AppText weight="semibold" style={styles.debtName} numberOfLines={1}>
                            {item.person}
                          </AppText>
                          <View style={styles.debtAmounts}>
                            {item.owed > 0 && (
                              <AppText weight="bold" color={colors.danger} style={styles.positionValue}>
                                Quỹ nợ {formatVnd(item.owed)}
                              </AppText>
                            )}
                            {item.held > 0 && (
                              <AppText weight="semibold" color={colors.warning} style={styles.debtHeld}>
                                Đang giữ ứng {formatVnd(item.held)}
                              </AppText>
                            )}
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                  {!!personFilter && (
                    <Pressable accessibilityRole="button" onPress={() => setPersonFilter('')} hitSlop={8}>
                      <AppText weight="semibold" color={colors.accent} style={styles.balanceLabel}>
                        Đang xem các dòng của {personFilter} · Bỏ lọc
                      </AppText>
                    </Pressable>
                  )}
                </View>
              )}

              {shownDays.length === 0 ? (
                <EmptyState text={personFilter ? `Không có dòng nào của ${personFilter} trong khoảng này` : 'Không có khoản nào trong khoảng này'} icon="check" />
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
                        // Màu dấu +/−: thu / hoàn xanh lá, chi đỏ, dòng tiền xuất (giao ứng, quỹ trả) xám.
                        const tint = cashOnly && !incoming ? colors.muted : incoming ? colors.success : colors.danger;
                        return (
                          <HistoryCard
                            key={`${entry.kind}:${entry.id}`}
                            open={openId === entry.id}
                            onOpen={() => setOpenId(entry.id)}
                            onClose={() => setOpenId((current) => (current === entry.id ? null : current))}
                            onPressRow={() => pressEntry(entry)}
                            onEdit={() => (entry.kind === 'contribution' || entry.kind === 'expense' ? setEditing(entry) : entry.advanceId ? openAdvance(entry.advanceId) : toast.show('Muốn sửa, hãy xoá giao dịch này rồi ghi lại', { bottom: TOAST_BOTTOM_HISTORY }))}
                            onDelete={() => void remove(entry)}
                            accessibilityLabel={`${entry.title}, ${incoming ? '+' : '-'}${formatVnd(entry.amount)}`}
                            icon={
                              <IconTile color={tint}>
                                <AppText weight="bold" color={tint} style={styles.iconText}>
                                  {incoming ? '+' : '−'}
                                </AppText>
                              </IconTile>
                            }
                            title={entry.title}
                            subtitle={name ? `${name} · ${entry.meta}` : entry.meta}
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
        </ScrollView>
      )}

      {action && (
        <FundActionSheet
          target={action}
          data={data}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void reload();
          }}
        />
      )}

      {editing && editingFund && (editingContribution || editingExpense) && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setEditing(null)}>
          <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
            <Pressable style={styles.flex} onPress={() => setEditing(null)} accessibilityLabel="Đóng" />
            <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 16 + insets.bottom }]}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                <ModalHeader title={editingContribution ? 'Sửa thu quỹ' : 'Sửa chi tiêu quỹ'} onClose={() => setEditing(null)} />
                {editingContribution ? (
                  <ContributionForm
                    fund={editingFund}
                    existing={editingContribution}
                    onChanged={() => {
                      setEditing(null);
                      void reload();
                    }}
                  />
                ) : (
                  <FundExpenseForm
                    fund={editingFund}
                    existing={editingExpense}
                    showTitle={false}
                    balance={fundBalance(data, editingFund.id)}
                    onChanged={() => {
                      setEditing(null);
                      void reload();
                    }}
                  />
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function PositionRow({ label, value, color }: { label: string; value: string; color?: string }) {
  const colors = useColors();
  return (
    <View style={styles.positionRow}>
      <AppText color={colors.muted} style={styles.balanceLabel} numberOfLines={1}>
        {label}
      </AppText>
      <AppText weight="semibold" color={color} style={styles.positionValue}>
        {value}
      </AppText>
    </View>
  );
}

// Số đo theo CSS `.mod-b` của PWA: thẻ bo 16 viền 1; tóm tắt cao 64; dòng cao 64, bo 14, biểu tượng 40×40 bo 12.
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  content: { paddingHorizontal: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden' },
  position: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  positionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  positionValue: { fontSize: 14, lineHeight: 20 },
  debtTitle: { fontSize: 14.5, lineHeight: 20 },
  debtRow: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  debtName: { flex: 1, fontSize: 15 },
  debtAmounts: { alignItems: 'flex-end' },
  debtHeld: { fontSize: 12.5, lineHeight: 17 },
  summary: { minHeight: 64, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryLeft: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 16, lineHeight: 22 },
  summaryPeriod: { fontSize: 12, lineHeight: 15 },
  summaryRight: { alignItems: 'flex-end' },
  summaryCount: { fontSize: 14, lineHeight: 19.5 },
  summaryAmount: { fontSize: 12, lineHeight: 15 },
  body: { paddingHorizontal: 12, paddingBottom: 8 },
  balance: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 12 },
  balanceLabel: { fontSize: 14, flexShrink: 1 },
  balanceValue: { fontSize: 16 },
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
