import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import { rowStatus } from '@/domain/billForm';
import { useColors } from '@/hooks/use-colors';
import type { BillSplit } from '@/types/bill';
import { formatVnd } from '@/utils/format';

/** Màu nhận lại / còn thiếu (`--in`, `--out` của PWA). */

interface Props {
  split: BillSplit;
  /**
   * Hiện dòng "Tổng bill". PWA chỉ hiện ở lịch sử (bill đã lưu); màn tính chia chỉ hiện "Mỗi người / Mỗi phần".
   */
  showTotal: boolean;
  /** Bọc trong khung trắng (màn tính chia); lịch sử đã có khung riêng nên tắt. */
  framed?: boolean;
  /** false: mức cố định sai thì KHÔNG hiện ô cảnh báo (không hiện biên lai thay vào); mặc định true. Màn tạo bill chỉ bật sau khi bấm Lưu bill mà không hợp lệ. */
  showWarning?: boolean;
}

/**
 * Biên lai chia bill (`En` của PWA): tổng / phần mỗi người, từng người nhận lại hay còn thiếu bao nhiêu, và các
 * khoản cần chuyển. Mức cố định sai thì hiện cảnh báo thay cho biên lai.
 */
export function SplitReceipt({ split, showTotal, framed = true, showWarning = true }: Props) {
  const colors = useColors();
  if (split.total <= 0) return null;

  if (split.bad) {
    if (!showWarning) return null;
    return (
      <View style={[styles.warn, { backgroundColor: colors.dangerSoft }]} accessibilityRole="alert">
        <AppText weight="semibold" color={colors.danger} style={styles.warnText}>
          {split.bad === 'over' ? 'Tổng số tiền đóng cố định lớn hơn tổng bill.' : 'Tổng số tiền đóng cố định khác tổng bill.'}
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.box, framed && { backgroundColor: colors.surface, borderRadius: AppRadius.card, padding: 14 }]}>
      <View style={styles.totRow}>
        {showTotal && (
          <View style={styles.totCell}>
            <AppText weight="semibold" color={colors.muted} style={styles.lbl}>
              Tổng bill
            </AppText>
            <AppText weight="display" style={styles.total} numberOfLines={1}>
              {formatVnd(split.total)}
            </AppText>
          </View>
        )}
        <View style={[styles.totCell, styles.totRight]}>
          <AppText weight="semibold" color={colors.muted} style={styles.lbl}>
            {split.even ? 'Mỗi người' : 'Mỗi phần'}
          </AppText>
          <AppText weight="display" style={styles.each} numberOfLines={1}>
            {formatVnd(split.share)}
          </AppText>
        </View>
      </View>
      <View style={[styles.dash, { borderTopColor: colors.line }]} />
      {split.rows.map((row) => {
        const status = rowStatus(row);
        return (
          <View key={row.index} style={styles.resultLine}>
            <View style={styles.resultMain}>
              <AppText weight="semibold" style={styles.who} numberOfLines={1}>
                {row.name}
              </AppText>
              <AppText color={colors.muted} style={styles.meta}>
                Chi {formatVnd(row.paid)}
              </AppText>
            </View>
            {status.kind === 'even' ? (
              <AppText weight="semibold" color={colors.muted} style={styles.statusText}>
                Đã đủ
              </AppText>
            ) : (
              <View style={styles.statusCol}>
                <AppText color={colors.muted} style={styles.statusLabel}>
                  {status.kind === 'get' ? 'Nhận lại' : 'Còn thiếu'}
                </AppText>
                <AppText weight="bold" color={status.kind === 'get' ? colors.success : colors.danger} style={styles.statusAmount}>
                  {status.kind === 'get' ? '+' : '−'}
                  {formatVnd(status.amount)}
                </AppText>
              </View>
            )}
          </View>
        );
      })}
      {split.transfers.length > 0 && (
        <>
          <View style={[styles.dash, { borderTopColor: colors.line }]} />
          <AppText weight="semibold" color={colors.muted} style={styles.lbl}>
            Cần chuyển
          </AppText>
          {split.transfers.map((transfer, index) => (
            <View key={index} style={styles.transfer}>
              <AppText weight="semibold" style={styles.transferWho} numberOfLines={1}>
                {transfer.from} → {transfer.to}
              </AppText>
              <AppText weight="bold" style={styles.statusAmount}>
                {formatVnd(transfer.amt)}
              </AppText>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  warn: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  warnText: { fontSize: 14 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  totCell: { flexShrink: 1, minWidth: 0 },
  totRight: { alignItems: 'flex-end', flexShrink: 0, marginLeft: 'auto' },
  lbl: { fontSize: 13 },
  total: { fontSize: 22 },
  each: { fontSize: 16 },
  dash: { borderTopWidth: 1, borderStyle: 'dashed' },
  resultLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resultMain: { flex: 1, minWidth: 0 },
  who: { fontSize: 15.5 },
  meta: { fontSize: 12.5, lineHeight: 17 },
  statusCol: { alignItems: 'flex-end' },
  statusLabel: { fontSize: 12 },
  statusAmount: { fontSize: 15.5 },
  statusText: { fontSize: 14 },
  transfer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  transferWho: { flex: 1, minWidth: 0, fontSize: 15 },
});
