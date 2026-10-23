import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/design';
import { HistoryCard, IconTile } from '@/components/history-card';
import { SvgIcon } from '@/components/svg-icon';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deletePaySynced } from '@/data/payService';
import { dayHeading, periodFromParams, periodTitle } from '@/domain/expenses';
import { buildPayHistory, payRowSubtitle, type PayRow } from '@/domain/payForm';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

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
        <LockableScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} onScrollBeginDrag={closeAll}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <AppText weight="semibold" style={styles.summaryTitle}>
                  Lịch sử giao dịch
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
                    +{formatVnd(history.totalIn)}
                  </AppText>
                  <AppText color={colors.danger} style={styles.summaryAmount}>
                    {'  '}−{formatVnd(history.totalOut)}
                  </AppText>
                </AppText>
              </View>
            </View>

            <View style={styles.body}>
              {history.days.length === 0 ? (
                <EmptyState text="Không có khoản nào trong khoảng này" icon="check" action={{ label: 'Ghi nhận chuyển tiền', onPress: () => router.push('/cong-no/ghi-nhan') }} />
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
        </LockableScrollView>
      )}
    </View>
  );
}

/** Một dòng khoản trả (vuốt để Sửa / Xoá); dùng chung với mục Giao dịch của tab Chi tiêu. `badge`: nhãn liên kết nếu có căn cứ. */
export function PayRowView({ row, rowProps, onDelete, badge }: { row: PayRow; rowProps: ReturnType<ReturnType<typeof useSingleOpenRow>['rowProps']>; onDelete: () => void; badge?: string }) {
  const colors = useColors();
  const tint = row.tone === 'get' ? colors.success : row.tone === 'owe' ? colors.danger : colors.muted;
  const sign = row.tone === 'get' ? '+' : row.tone === 'owe' ? '−' : '';
  const subtitle = payRowSubtitle(row);
  return (
    <HistoryCard
      {...rowProps}
      onPressRow={() => {
        rowProps.onPressRow?.();
        router.push({ pathname: '/cong-no/giao-dich', params: { id: row.ids[0] } });
      }}
      onEdit={() => router.push({ pathname: '/cong-no/sua', params: { ids: row.ids.join(',') } })}
      onDelete={onDelete}
      accessibilityLabel={`${row.from} trả ${row.to}, ${formatVnd(row.amt)}`}
      icon={
        <IconTile color={tint}>
          <SvgIcon name="tabTransactions" size={22} color={tint} />
        </IconTile>
      }
      title={`${row.from} → ${row.to}`}
      subtitle={[row.title, subtitle].filter(Boolean).join(' · ')}
      badge={badge}
      amount={`${sign}${formatVnd(row.amt)}`}
      tone={row.tone}
    />
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
  body: { paddingHorizontal: 12, paddingBottom: 8 },
  empty: { textAlign: 'center', fontSize: 15, paddingVertical: 28 },
  day: {},
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, marginTop: 8, marginBottom: 4 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
  item: { minHeight: 64, paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 15.5, lineHeight: 20 },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemAmount: { fontSize: 16, lineHeight: 23 },
});
