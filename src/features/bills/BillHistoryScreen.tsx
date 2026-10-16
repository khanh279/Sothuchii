import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, TransactionRow } from '@/components/design';
import { CategoryIcon } from '@/components/category-icon';
import { SwipeRow } from '@/components/swipe-row';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteBillSynced } from '@/data/billService';
import { formatMoney } from '@/domain/billForm';
import { billTotal, buildBillHistory } from '@/domain/billHistory';
import { dayHeading, periodFromParams, periodTitle, resolveCategory } from '@/domain/expenses';
import { describeBillError, useBills } from '@/features/bills/hooks';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import { formatVnDate, todayStr } from '@/utils/date';

/**
 * Lịch sử Chia bill trong một kỳ (khung "Chia bill" của trang Lịch sử PWA): bill gom theo ngày, mới nhất trước.
 * Chạm một bill để mở màn Chi tiết bill (theo mã bill). Vuốt dòng sang trái để hiện Sửa / Xóa (Xóa bấm hai lần);
 * chỉ một dòng mở tại một thời điểm. Xóa bill sẽ dọn khoản chi cá nhân đã tạo từ bill đó.
 */
export interface BillHistoryTabMode {
  /** Kỳ đang xem (do tab giữ, không lấy từ tham số route). */
  period: Period;
  /** Đầu trang (tiêu đề + bộ chọn kỳ). */
  header: ReactNode;
}

export default function BillHistoryScreen({ tab }: { tab?: BillHistoryTabMode } = {}) {
  const params = useLocalSearchParams<{ mode?: string; month?: string; year?: string; from?: string; to?: string }>();
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  // Mở từ Tổng quan: dùng đúng kỳ đang xem ở đó, không có ô chọn lại thời gian.
  const { mode, month, year, from, to } = params;
  const paramPeriod = useMemo(() => periodFromParams({ mode, month, year, from, to }, today), [mode, month, year, from, to, today]);
  const period = tab ? tab.period : paramPeriod;
  const { settings } = useExpenseSettings();
  const { bills, loaded, error, reload } = useBills();
  const { closeAll, rowProps } = useSingleOpenRow();

  const history = useMemo(() => buildBillHistory(bills, period), [bills, period]);

  async function remove(id: string) {
    try {
      await deleteBillSynced(id);
      closeAll();
      toast.show('Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeBillError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: tab ? 0 : 12 + insets.top }]}>
      {!tab && <Stack.Screen options={{ title: 'Lịch sử bill', headerShown: false }} />}
      {tab?.header}
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: (tab ? 110 : 24) + insets.bottom }]} onScrollBeginDrag={closeAll}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <AppText weight="semibold" style={styles.summaryTitle}>
                  {tab ? 'Danh sách bill' : 'Lịch sử bill'}
                </AppText>
                <AppText weight="medium" color={colors.muted} style={styles.summaryPeriod}>
                  {periodTitle(period)}
                </AppText>
              </View>
              <View style={styles.summaryRight}>
                <AppText weight="semibold" color={colors.muted} style={styles.summaryCount}>
                  {history.count} bill
                </AppText>
                <AppText weight="medium" color={colors.muted} style={styles.summaryAmount}>
                  {formatMoney(history.totalPaid)}
                </AppText>
              </View>
            </View>

            <View style={styles.body}>
              {history.days.length === 0 ? (
                <EmptyState text="Không có bill trong khoảng này" icon="check" />
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
                        {formatMoney(day.total)}
                      </AppText>
                    </View>
                    <View style={styles.rows}>
                      {day.bills.map((bill) => {
                        const category = resolveCategory(settings, bill.cat);
                        const props = rowProps(bill.id);
                        return (
                          <SwipeRow
                            key={bill.id}
                            {...props}
                            onPressRow={() => {
                              props.onPressRow();
                              router.push({ pathname: '/chia-bill/chi-tiet', params: { id: bill.id } });
                            }}
                            onEdit={() => router.push({ pathname: '/chia-bill/sua', params: { id: bill.id } })}
                            onDelete={() => void remove(bill.id)}
                            background={colors.bg}
                            radius={AppRadius.field}
                            accessibilityLabel={`${bill.title || 'Không tên'}, ${formatMoney(billTotal(bill))}`}>
                            <TransactionRow
                              bare
                              icon={<CategoryIcon category={category} />}
                              title={bill.title || 'Không tên'}
                              subtitle={`${category.name} · ${bill.people.length} người`}
                              amount={formatMoney(billTotal(bill))}
                            />
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
    </View>
  );
}

// Số đo theo `.mod-c` / lịch sử PWA: thẻ bo 16 viền 1; tóm tắt cao 64; dòng cao 64 bo 14 biểu tượng 40.
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
  row: { minHeight: 64, paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15.5, lineHeight: 19.4 },
  rowSub: { fontSize: 12, lineHeight: 15.6 },
  rowAmount: { fontSize: 16, lineHeight: 23 },
});
