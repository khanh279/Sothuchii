import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/design';
import { SwipeRow } from '@/components/swipe-row';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteContributionSynced, deleteFundExpenseSynced } from '@/data/fundService';
import { dayHeading, periodFromParams, periodTitle } from '@/domain/expenses';
import { buildFundHistory, type FundHistoryEntry } from '@/domain/fundHistory';
import { ContributionForm } from '@/features/funds/ContributionForm';
import { FundExpenseForm } from '@/features/funds/FundExpenseForm';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { fundBalance } from '@/domain/funds';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/utils/color';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Màu thu / chi của Quỹ (`--in`, `--out` của PWA). */
const IN_COLOR = '#0F8A4B';
const OUT_COLOR = '#D64545';

/**
 * Lịch sử Quỹ nhóm trong một kỳ: số dư, rồi các lần đóng và khoản chi gom theo ngày. Vuốt dòng để Sửa / Xoá.
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

  const history = useMemo(() => buildFundHistory(data, params.fund || 'all', period), [data, params.fund, period]);
  const single = history.filter !== 'all' ? history.funds[0] : null;
  const fundName = (id: string) => data.funds.find((fund) => fund.id === id)?.name ?? '';

  async function remove(entry: FundHistoryEntry) {
    try {
      if (entry.kind === 'contribution') await deleteContributionSynced(entry.id);
      else await deleteFundExpenseSynced(entry.id);
      setOpenId(null);
      toast.show(entry.kind === 'contribution' ? 'Đã xóa lần đóng quỹ' : 'Đã xóa khoản chi', { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeFundError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  const editingContribution = editing?.kind === 'contribution' ? data.contribs.find((c) => c.id === editing.id) : undefined;
  const editingExpense = editing?.kind === 'expense' ? data.expenses.find((e) => e.id === editing.id) : undefined;
  const editingFund = editing ? data.funds.find((fund) => fund.id === editing.fundId) : undefined;

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
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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
                  <AppText color={IN_COLOR} style={styles.summaryAmount}>
                    +{formatVnd(history.totalIn)}
                  </AppText>
                  <AppText color={OUT_COLOR} style={styles.summaryAmount}>
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
                  <AppText weight="bold" color={history.balance < 0 ? OUT_COLOR : IN_COLOR} style={styles.balanceValue}>
                    {formatVnd(history.balance)}
                  </AppText>
                </View>
              )}

              {history.days.length === 0 ? (
                <EmptyState text="Không có khoản nào trong khoảng này" icon="check" />
              ) : (
                history.days.map((day) => (
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
                        const incoming = entry.kind === 'contribution';
                        const name = history.showFundName ? fundName(entry.fundId) : '';
                        return (
                          <SwipeRow
                            key={`${entry.kind}:${entry.id}`}
                            open={openId === entry.id}
                            onOpen={() => setOpenId(entry.id)}
                            onClose={() => setOpenId((current) => (current === entry.id ? null : current))}
                            onPressRow={() => setOpenId(null)}
                            onEdit={() => setEditing(entry)}
                            onDelete={() => void remove(entry)}
                            background={colors.bg}
                            radius={AppRadius.field}
                            accessibilityLabel={`${entry.title}, ${incoming ? '+' : '-'}${formatVnd(entry.amount)}`}>
                            <View style={styles.row}>
                              <View style={[styles.icon, { backgroundColor: withAlpha(incoming ? IN_COLOR : OUT_COLOR, 0.14) }]}>
                                <AppText weight="bold" color={incoming ? IN_COLOR : OUT_COLOR} style={styles.iconText}>
                                  {incoming ? '+' : '−'}
                                </AppText>
                              </View>
                              <View style={styles.rowText}>
                                <AppText weight="semibold" style={styles.rowTitle} numberOfLines={1}>
                                  {entry.title}
                                </AppText>
                                <AppText color={colors.muted} style={styles.rowSub} numberOfLines={1}>
                                  {name ? `${name} · ${entry.meta}` : entry.meta}
                                </AppText>
                              </View>
                              <AppText weight="bold" color={incoming ? IN_COLOR : OUT_COLOR} style={styles.rowAmount}>
                                {incoming ? '+' : '−'}
                                {formatVnd(entry.amount)}
                              </AppText>
                            </View>
                          </SwipeRow>
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

      {editing && editingFund && (editingContribution || editingExpense) && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setEditing(null)}>
          <View style={[styles.scrim, { backgroundColor: withAlpha('#000000', 0.45) }]}>
            <Pressable style={styles.flex} onPress={() => setEditing(null)} accessibilityLabel="Đóng" />
            <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 16 + insets.bottom }]}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setEditing(null)} style={styles.close}>
                  <AppText weight="bold" color={colors.muted} style={styles.closeText}>
                    ×
                  </AppText>
                </Pressable>
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

// Số đo theo CSS `.mod-b` của PWA: thẻ bo 16 viền 1; tóm tắt cao 64; dòng cao 64, bo 14, biểu tượng 40×40 bo 12.
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  content: { paddingHorizontal: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, borderWidth: 1, overflow: 'hidden' },
  summary: { minHeight: 64, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryLeft: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 16, lineHeight: 22 },
  summaryPeriod: { fontSize: 12, lineHeight: 15 },
  summaryRight: { alignItems: 'flex-end' },
  summaryCount: { fontSize: 14, lineHeight: 19.5 },
  summaryAmount: { fontSize: 12, lineHeight: 15 },
  body: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 12 },
  balance: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 12 },
  balanceLabel: { fontSize: 14, flexShrink: 1 },
  balanceValue: { fontSize: 16 },
  empty: { textAlign: 'center', fontSize: 15, paddingVertical: 28 },
  day: { marginBottom: 6 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, marginTop: 6, marginBottom: 6 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 8 },
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
