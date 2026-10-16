import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, TransactionRow } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import { SwipeRow } from '@/components/swipe-row';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deletePaySynced } from '@/data/payService';
import { formatMoney } from '@/domain/billForm';
import { dayHeading, periodFromParams, periodTitle } from '@/domain/expenses';
import { buildPayHistory, payRowSubtitle, type PayRow } from '@/domain/payForm';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import { withAlpha } from '@/utils/color';
import { formatVnDate, todayStr } from '@/utils/date';

/** Màu theo chiều tiền (`.lg-ico.get/owe/mid` của PWA). */

/**
 * Lịch sử khoản trả (khung "Giao dịch" của trang Lịch sử PWA) trong một kỳ: gom theo ngày, mới nhất trước.
 * Chạm một dòng để sửa hoặc xoá. Gộp nợ không hiện ở đây. Tham số route: kỳ (`mode`, `month`, `year`, `from`, `to`).
 */
export default function PayHistoryScreen() {
  const params = useLocalSearchParams<{ mode?: string; month?: string; year?: string; from?: string; to?: string }>();
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Mở từ Tổng quan: dùng đúng kỳ đang xem ở đó, không có ô chọn lại ngày.
  const { mode, month, year, from, to } = params;
  const period = useMemo(() => periodFromParams({ mode, month, year, from, to }, today), [mode, month, year, from, to, today]);
  const toast = useToast();
  const { bills, pays, loaded, error, reload } = useDebtData();
  const { closeAll, rowProps } = useSingleOpenRow();
  const history = useMemo(() => buildPayHistory(pays, bills, period), [pays, bills, period]);

  async function remove(row: PayRow) {
    try {
      await deletePaySynced(row.ids);
      closeAll();
      toast.show('Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeDebtError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Lịch sử giao dịch', headerShown: false }} />
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} onScrollBeginDrag={closeAll}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <AppText weight="semibold" style={styles.summaryTitle}>
                  Giao dịch
                </AppText>
                <AppText weight="medium" color={colors.muted} style={styles.summaryPeriod}>
                  {periodTitle(period)}
                </AppText>
              </View>
              <View style={styles.summaryRight}>
                <AppText weight="semibold" color={colors.muted} style={styles.summaryCount}>
                  {history.count} khoản
                </AppText>
                <AppText weight="medium" style={styles.summaryAmount}>
                  <AppText color={colors.success} style={styles.summaryAmount}>
                    +{formatMoney(history.totalIn)}
                  </AppText>
                  <AppText color={colors.danger} style={styles.summaryAmount}>
                    {'  '}−{formatMoney(history.totalOut)}
                  </AppText>
                </AppText>
              </View>
            </View>

            <View style={styles.body}>
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
                        {day.rows.length} khoản
                      </AppText>
                    </View>
                    <View style={styles.rows}>
                      {day.rows.map((row) => (
                        <PayRowView key={row.ids.join(',')} row={row} rowProps={rowProps(row.ids.join(','))} onDelete={() => void remove(row)} />
                      ))}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function PayRowView({ row, rowProps, onDelete }: { row: PayRow; rowProps: ReturnType<ReturnType<typeof useSingleOpenRow>['rowProps']>; onDelete: () => void }) {
  const colors = useColors();
  const tone = row.tone === 'get' ? colors.success : row.tone === 'owe' ? colors.danger : colors.muted;
  const sign = row.tone === 'get' ? '+' : row.tone === 'owe' ? '−' : '';
  const subtitle = payRowSubtitle(row);
  return (
    <SwipeRow
      {...rowProps}
      onEdit={() => router.push({ pathname: '/cong-no/sua', params: { ids: row.ids.join(',') } })}
      onDelete={onDelete}
      background={colors.bg}
      radius={AppRadius.field}
      accessibilityLabel={`${row.from} trả ${row.to}, ${formatMoney(row.amt)}`}>
      <TransactionRow
        bare
        icon={
          <View style={[styles.icon, { backgroundColor: withAlpha(tone, 0.16) }]}>
            <SvgIcon name="tabTransactions" size={22} color={tone} />
          </View>
        }
        title={`${row.from} → ${row.to}`}
        subtitle={[row.title, subtitle].filter(Boolean).join(' · ')}
        amount={`${sign}${formatMoney(row.amt)}`}
        tone={row.tone}
      />
    </SwipeRow>
  );
}

// Số đo theo `.mod-c` / lịch sử PWA: thẻ bo 16 viền 1; tóm tắt cao 64; dòng cao 64 bo 14 biểu tượng 40×40 bo 12.
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 8 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, marginTop: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden' },
  summary: { minHeight: 64, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryLeft: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 16, lineHeight: 22 },
  summaryPeriod: { fontSize: 12, lineHeight: 15 },
  summaryRight: { alignItems: 'flex-end' },
  summaryCount: { fontSize: 14, lineHeight: 19.5 },
  summaryAmount: { fontSize: 12, lineHeight: 15 },
  body: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 12 },
  empty: { textAlign: 'center', fontSize: 15, paddingVertical: 28 },
  day: { marginBottom: 6 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, marginTop: 6, marginBottom: 6 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 8 },
  item: { minHeight: 64, paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 15.5, lineHeight: 20 },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemAmount: { fontSize: 16, lineHeight: 23 },
});
