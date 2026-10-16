import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ChipRow, EmptyState, SegmentedControl } from '@/components/design';
import { CategoryIcon } from '@/components/category-icon';
import { HistoryCard } from '@/components/history-card';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteBillSynced } from '@/data/billService';
import { formatMoney } from '@/domain/billForm';
import { billSettled, billTransferStatuses } from '@/domain/billPayment';
import { billTotal, buildBillHistory, filterBillsByCategory } from '@/domain/billHistory';
import { categoriesInUse, dayHeading, periodFromParams, periodTitle, resolveCategory } from '@/domain/expenses';
import { describeBillError } from '@/features/bills/hooks';
import { useDebtData } from '@/features/debts/hooks';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import { formatVnDate, todayStr } from '@/utils/date';

/**
 * Lịch sử Chia bill trong một kỳ (khung "Chia bill" của trang Lịch sử PWA): bill gom theo ngày, mới nhất trước.
 * Chạm một bill để mở màn Chi tiết bill (theo mã bill). Vuốt dòng sang trái để hiện Sửa / Xóa (Xóa bấm hai lần);
 * chỉ một dòng mở tại một thời điểm. Xóa bill sẽ dọn khoản chi cá nhân đã tạo từ bill đó.
 */
type BillStatusFilter = 'all' | 'unpaid' | 'paid';
const STATUS_OPTIONS: { value: BillStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unpaid', label: 'Chưa thanh toán' },
  { value: 'paid', label: 'Đã thanh toán' },
];

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
  const { bills, pays, loaded, error, reload } = useDebtData();
  const { closeAll, rowProps } = useSingleOpenRow();

  // Chip danh mục (chỉ ở tab Chia bill): các mục chi có bill trong kỳ; chip đang chọn mà không còn bill nào thì quay về "Tất cả".
  const [catChip, setCatChip] = usePersistedState<string>('tab:chia-bill:chip', () => 'all');
  const periodBills = useMemo(() => buildBillHistory(bills, period).days.flatMap((day) => day.bills), [bills, period]);
  const inUse = useMemo(() => categoriesInUse(periodBills.map((bill) => ({ c: bill.cat })), settings), [periodBills, settings]);
  const activeCat = tab && (catChip === 'all' || inUse.some((cat) => cat.id === catChip)) ? catChip : 'all';
  const catOptions = useMemo(() => [{ value: 'all', label: 'Tất cả' }, ...inUse.map((cat) => ({ value: cat.id, label: cat.name }))], [inUse]);
  // Trạng thái thanh toán chung của từng bill (đọc từ khoản trả thực tế, theo quy tắc phân bổ có sẵn): lọc Tất cả / Chưa / Đã thanh toán.
  const [statusFilter, setStatusFilter] = usePersistedState<BillStatusFilter>('tab:chia-bill:status', () => 'all');
  const transfers = useMemo(() => billTransferStatuses(bills, pays), [bills, pays]);
  const settledOf = (id: string) => billSettled(transfers.get(id));
  const activeStatus: BillStatusFilter = tab ? statusFilter : 'all';
  const history = useMemo(() => {
    const byCategory = filterBillsByCategory(bills, settings, activeCat);
    const byStatus = activeStatus === 'all' ? byCategory : byCategory.filter((bill) => billSettled(transfers.get(bill.id)) === (activeStatus === 'paid'));
    return buildBillHistory(byStatus, period);
  }, [bills, settings, activeCat, activeStatus, transfers, period]);

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
          {tab && periodBills.length > 0 && (
            <View style={styles.status}>
              <SegmentedControl
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(next) => {
                  closeAll();
                  setStatusFilter(next);
                }}
              />
            </View>
          )}
          {tab && periodBills.length > 0 && (
            <View style={styles.chips}>
              <ChipRow
                options={catOptions}
                value={activeCat}
                onChange={(next) => {
                  closeAll();
                  setCatChip(next);
                }}
              />
            </View>
          )}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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
                <EmptyState text={periodBills.length > 0 ? 'Không có bill nào khớp bộ lọc trong kỳ' : 'Không có bill trong khoảng này'} icon="check" />
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
                          <HistoryCard
                            key={bill.id}
                            {...props}
                            onPressRow={() => {
                              props.onPressRow();
                              router.push({ pathname: '/chia-bill/chi-tiet', params: { id: bill.id } });
                            }}
                            onEdit={() => router.push({ pathname: '/chia-bill/sua', params: { id: bill.id } })}
                            onDelete={() => void remove(bill.id)}
                            accessibilityLabel={`${bill.title || 'Không tên'}, ${category.name}, ${formatMoney(billTotal(bill))}`}
                            icon={<CategoryIcon category={category} />}
                            title={bill.title || 'Không tên'}
                            subtitle={`${formatVnDate(bill.date)} · ${bill.people.length} người`}
                            badge={settledOf(bill.id) ? 'Đã thanh toán' : 'Chưa thanh toán'}
                            badgeTone={settledOf(bill.id) ? 'get' : 'owe'}
                            amount={formatMoney(billTotal(bill))}
                            meta="Tổng bill"
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
  /** Hàng chip tràn hết bề rộng màn hình (bù đệm ngang của nội dung). */
  chips: { marginHorizontal: -12, marginBottom: 12 },
  status: { marginBottom: 12 },
  card: { borderRadius: AppRadius.card, borderWidth: 1, overflow: 'hidden' },
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
  /** Khoảng trên tiêu đề ngày lớn hơn khoảng dưới để tiêu đề thuộc về nhóm bên dưới; không còn lề kép giữa các nhóm. */
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, marginTop: 8, marginBottom: 4 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
  row: { minHeight: 64, paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15.5, lineHeight: 19.4 },
  rowSub: { fontSize: 12, lineHeight: 15.6 },
  rowAmount: { fontSize: 16, lineHeight: 23 },
});
