import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState } from '@/components/design';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deletePaySynced } from '@/data/payService';
import { dayHeading, periodTitle } from '@/domain/expenses';
import { PAY_FILTER_LABEL, countPayRows, filterPayDays, payLinkLabel, payTypesInUse, type PayFilter } from '@/domain/expenseTab';
import { buildPayHistory, type PayRow } from '@/domain/payForm';
import { PayRowView } from '@/features/debts/PayHistoryScreen';
import { describeDebtError } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

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
  const { closeAll, rowProps } = useSingleOpenRow();

  // Lọc theo loại giao dịch: Chuyển tiền hoặc Trả bill (chỉ loại có dữ liệu trong kỳ); nút "Tất cả" ở đầu để bỏ lọc.
  const [kindPick, setKindPick] = useState<PayFilter>('all');
  const history = useMemo(() => buildPayHistory(pays, bills, period), [pays, bills, period]);
  const kinds = useMemo(() => payTypesInUse(history.days), [history.days]);
  const kind = kindPick !== 'all' && kinds.includes(kindPick) ? kindPick : 'all';
  const days = useMemo(() => filterPayDays(history.days, kind), [history.days, kind]);

  const totalAmount = useMemo(() => days.reduce((sum, day) => sum + day.rows.reduce((inner, row) => inner + row.amt, 0), 0), [days]);

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
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.head}>
          <CardHead title="Lịch sử giao dịch" subtitle={periodTitle(period)} rightTop={`${countPayRows(days)} giao dịch`} rightBottom={formatVnd(totalAmount)} />
        </View>
        {kinds.length > 0 && (
          <View style={styles.chips}>
            <ChipRow
              options={[{ value: 'all' as const, label: PAY_FILTER_LABEL.all }, ...kinds.map((item) => ({ value: item, label: PAY_FILTER_LABEL[item] }))]}
              value={kind}
              onChange={(next) => {
                closeAll();
                setKindPick(next);
              }}
            />
          </View>
        )}
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
  chips: { paddingBottom: 4 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden', paddingBottom: 12 },
  head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  day: { gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
