import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ChipRow, EmptyState } from '@/components/design';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deletePaySynced } from '@/data/payService';
import { dayHeading, periodTitle } from '@/domain/expenses';
import { PAY_FILTER_LABEL, countPayRows, filterPayDays, payLinkLabel, payTypesInUse, type PayFilter } from '@/domain/expenseTab';
import { buildPayHistory, type PayRow } from '@/domain/payForm';
import { PayRowView } from '@/features/debts/PayHistoryScreen';
import { describeDebtError } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';
import { formatVnDate, todayStr } from '@/utils/date';

interface Props {
  bills: readonly Bill[];
  pays: readonly Pay[];
  reload: () => Promise<void> | void;
}

/**
 * Mục "Giao dịch" của tab Công nợ: lịch sử khoản trả / chuyển tiền (cùng nguồn và cách gom dòng với màn Lịch sử giao dịch — `buildPayHistory`,
 * không gồm gộp nợ) trong kỳ DÙNG CHUNG chọn ở Tổng quan, kèm hàng nút lọc loại (Trả bill / Chuyển tiền, chỉ loại có dữ liệu). Vuốt để Sửa / Xoá
 * như màn Lịch sử. Chỉ xem: không có nút tạo giao dịch ở đây (nút "Ghi nhận chuyển tiền" nằm phía trên tab).
 */
export function PayTransactions({ bills, pays, reload }: Props) {
  const colors = useColors();
  const today = todayStr();
  const toast = useToast();
  const { period } = useSharedPeriod();
  const [payChip, setPayChip] = usePersistedState<PayFilter>('tab:cong-no:payChip', () => 'all');
  const { closeAll, rowProps } = useSingleOpenRow();

  const history = useMemo(() => buildPayHistory(pays, bills, period), [pays, bills, period]);
  const types = useMemo(() => payTypesInUse(history.days), [history.days]);
  const active: PayFilter = payChip === 'all' || types.includes(payChip) ? payChip : 'all';
  const days = useMemo(() => filterPayDays(history.days, active), [history.days, active]);
  const options = useMemo(() => [{ value: 'all' as PayFilter, label: PAY_FILTER_LABEL.all }, ...types.map((type) => ({ value: type as PayFilter, label: PAY_FILTER_LABEL[type] }))], [types]);

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
    <>
      {history.count > 0 && (
        <View style={styles.chips}>
          <ChipRow
            options={options}
            value={active}
            onChange={(next) => {
              closeAll();
              setPayChip(next);
            }}
          />
        </View>
      )}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.head}>
          <AppText weight="semibold" style={styles.title} numberOfLines={1}>
            {countPayRows(days)} giao dịch
          </AppText>
          <AppText color={colors.muted} style={styles.sub} numberOfLines={1}>
            {periodTitle(period)}
          </AppText>
        </View>
        {days.length === 0 ? (
          <EmptyState text={history.count === 0 ? 'Chưa có giao dịch nào trong kỳ này' : 'Không có giao dịch nào thuộc loại này trong kỳ'} icon="check" />
        ) : (
          days.map((day) => (
            <View key={day.date} style={styles.day}>
              <View style={styles.dayHeader}>
                <AppText color={colors.muted} style={styles.dayName} numberOfLines={1}>
                  <AppText weight="semibold" style={styles.dayName}>
                    {dayHeading(day.date, today)}
                  </AppText>
                  , {formatVnDate(day.date)}
                </AppText>
                <AppText color={colors.muted} style={styles.dayName}>
                  {day.rows.length} giao dịch
                </AppText>
              </View>
              <View style={styles.rows}>
                {day.rows.map((row) => (
                  <PayRowView key={row.ids.join(',')} row={row} rowProps={rowProps(row.ids.join(','))} onDelete={() => void remove(row)} badge={payLinkLabel(row) ?? undefined} />
                ))}
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  /** Hàng chip tràn hết bề rộng màn hình (bù đệm ngang của nội dung). */
  chips: { marginHorizontal: -16 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden', paddingBottom: 12 },
  head: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  title: { fontSize: 15, lineHeight: 20 },
  sub: { fontSize: 12, lineHeight: 16 },
  day: { gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
