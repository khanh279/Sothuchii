import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { SvgIcon } from '@/components/svg-icon';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteBillSynced } from '@/data/billService';
import { computeSplit } from '@/domain/bills';
import { formatMoney } from '@/domain/billForm';
import { billTotal, buildBillHistory } from '@/domain/billHistory';
import { dayHeading, initialPeriodView, periodOf, periodTitle, resolveCategory } from '@/domain/expenses';
import { describeBillError, useBills } from '@/features/bills/hooks';
import { SplitReceipt } from '@/features/bills/SplitReceipt';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { PeriodBar } from '@/features/expenses/PeriodBar';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';

/**
 * Lịch sử Chia bill trong một kỳ (khung "Chia bill" của trang Lịch sử PWA): bill gom theo ngày, mới nhất trước.
 * Chạm một bill để xem biên lai (Tổng bill, phần mỗi người, cần chuyển); trong đó có Sửa và Xóa (bấm hai lần).
 * Xóa bill sẽ dọn khoản chi cá nhân đã tạo từ bill đó.
 */
export default function BillHistoryScreen() {
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [view, setView] = useState(() => initialPeriodView(today));
  const period = useMemo(() => periodOf(view), [view]);
  const { settings } = useExpenseSettings();
  const { bills, loaded, error, reload } = useBills();
  const [openId, setOpenId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  const history = useMemo(() => buildBillHistory(bills, period), [bills, period]);

  async function remove(id: string) {
    if (armedId !== id) {
      setArmedId(id);
      setTimeout(() => setArmedId((current) => (current === id ? null : current)), 3500);
      return;
    }
    try {
      await deleteBillSynced(id);
      setArmedId(null);
      setOpenId(null);
      toast.show('Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeBillError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <Stack.Screen options={{ title: 'Lịch sử bill', headerShown: false }} />
      <PeriodBar view={view} onChange={setView} today={today} />
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <AppText weight="semibold" style={styles.summaryTitle}>
                  Chia bill
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
                <AppText color={colors.muted} style={styles.empty}>
                  Không có bill trong khoảng này
                </AppText>
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
                        const open = openId === bill.id;
                        const category = resolveCategory(settings, bill.cat);
                        const armed = armedId === bill.id;
                        return (
                          <View key={bill.id} style={[styles.item, { backgroundColor: colors.bg, borderColor: open ? colors.primary : 'transparent' }]}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ expanded: open }}
                              onPress={() => {
                                setOpenId(open ? null : bill.id);
                                setArmedId(null);
                              }}
                              style={styles.row}>
                              <CategoryIcon category={category} />
                              <View style={styles.rowText}>
                                <AppText weight="semibold" style={styles.rowTitle} numberOfLines={1}>
                                  {bill.title || 'Không tên'}
                                </AppText>
                                <AppText color={colors.muted} style={styles.rowSub} numberOfLines={1}>
                                  {category.name} · {bill.people.length} người
                                </AppText>
                              </View>
                              <AppText weight="bold" style={styles.rowAmount}>
                                {formatMoney(billTotal(bill))}
                              </AppText>
                            </Pressable>
                            {open && (
                              <View style={styles.detail}>
                                <SplitReceipt split={computeSplit(bill.people)} showTotal framed={false} />
                                <View style={styles.actions}>
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() => router.push({ pathname: '/chia-bill/sua', params: { id: bill.id } })}
                                    style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                                    <SvgIcon name="edit" size={16} color={colors.ink} />
                                    <AppText weight="semibold" style={styles.actionText}>
                                      Sửa
                                    </AppText>
                                  </Pressable>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={armed ? 'Bấm lần nữa để xóa' : 'Xóa'}
                                    onPress={() => void remove(bill.id)}
                                    style={[styles.action, { backgroundColor: armed ? '#D64545' : colors.dangerSoft, borderColor: 'transparent' }]}>
                                    <AppText weight="semibold" color={armed ? '#FFFFFF' : colors.danger} style={styles.actionText}>
                                      {armed ? 'Bấm lần nữa để xóa' : 'Xóa'}
                                    </AppText>
                                  </Pressable>
                                </View>
                              </View>
                            )}
                          </View>
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
  card: { borderRadius: AppRadius.card, borderWidth: 1, overflow: 'hidden' },
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
  item: { borderRadius: AppRadius.field, borderWidth: 1, overflow: 'hidden' },
  row: { minHeight: 64, paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15.5, lineHeight: 19.4 },
  rowSub: { fontSize: 12, lineHeight: 15.6 },
  rowAmount: { fontSize: 16, lineHeight: 23 },
  detail: { paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { fontSize: 14.5 },
});
