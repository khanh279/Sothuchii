import { forwardRef } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { SoTienColors } from '@/constants/palette';
import { rowMeta, rowStatus } from '@/domain/billForm';
import { TRANSFER_STATE_LABEL, type BillTransferStatus, type TransferPayState } from '@/domain/billPayment';
import type { Category } from '@/types/expense';
import type { Bill, BillSplit } from '@/types/bill';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Bề rộng cố định (dp) của ảnh bill; chiều cao theo nội dung nên bill nhiều người vẫn đầy đủ, không bị cắt. */
export const BILL_IMAGE_WIDTH = 375;

/** Ảnh luôn dùng bảng màu sáng (không theo chế độ tối của thiết bị) để người nhận thấy cùng một hình. */
const C = SoTienColors.light;
const STATE_COLOR: Record<TransferPayState, string> = { paid: C.success, unpaid: C.danger, partial: C.warning };

interface Props {
  bill: Bill;
  category: Category;
  /** Kết quả `computeSplit` của chính màn hình chi tiết (không tính lại ở đây). */
  split: BillSplit;
  /** Các khoản chuyển kèm trạng thái thanh toán thực tế (`billTransferStatuses`). */
  statuses: readonly BillTransferStatus[];
}

/**
 * Bản "biên lai" của bill dùng để xuất thành ảnh (Lưu ảnh / Chia sẻ). Dùng lại đúng dữ liệu và định dạng của màn Chi tiết bill:
 * tên, ngày, danh mục, tổng tiền, phần mỗi người, từng người (đã chi / phải chịu / nhận lại hay còn thiếu) và các khoản cần chuyển
 * với trạng thái thanh toán. Nền trắng, tự cao theo nội dung. Mọi chữ đều đặt màu rõ ràng vì ảnh không đi theo giao diện sáng/tối.
 */
export const BillImage = forwardRef<HostInstance, Props>(function BillImage({ bill, category, split, statuses }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.sheet}>
      <AppText weight="semibold" color={C.muted} style={styles.brand}>
        Sổ Thu Chi · Chia bill
      </AppText>

      <View style={styles.infoTop}>
        <CategoryIcon category={category} />
        <View style={styles.flex}>
          <AppText weight="semibold" color={C.ink} style={styles.title}>
            {bill.title || 'Không tên'}
          </AppText>
          <AppText color={C.muted} style={styles.sub}>
            {formatVnDate(bill.date)} · {category.name} · {bill.people.length} người
          </AppText>
        </View>
      </View>

      <View style={styles.totalRow}>
        <View style={styles.flex}>
          <AppText weight="medium" color={C.muted} style={styles.label}>
            Tổng tiền bill
          </AppText>
          <AppText weight="display" color={C.ink} style={styles.total}>
            {formatVnd(split.total)}
          </AppText>
        </View>
        {split.total > 0 && !split.bad && (
          <View style={styles.shareCol}>
            <AppText weight="medium" color={C.muted} style={styles.label}>
              {split.even ? 'Mỗi người' : 'Mỗi phần'}
            </AppText>
            <AppText weight="bold" color={C.ink} style={styles.share}>
              {formatVnd(split.share)}
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.rule} />
      <AppText weight="semibold" color={C.muted} style={styles.label}>
        Từng người
      </AppText>
      {split.rows.map((row) => {
        const status = rowStatus(row);
        const color = status.kind === 'get' ? C.success : status.kind === 'owe' ? C.danger : C.muted;
        return (
          <View key={row.index} style={styles.personRow}>
            <View style={styles.flex}>
              <AppText weight="semibold" color={C.ink} style={styles.who}>
                {row.name}
              </AppText>
              <AppText color={C.muted} style={styles.meta}>
                {rowMeta(row)}
              </AppText>
            </View>
            <View style={styles.statusCol}>
              <AppText color={C.muted} style={styles.statusLabel}>
                {status.kind === 'get' ? 'Nhận lại' : status.kind === 'owe' ? 'Còn thiếu' : 'Đã đủ'}
              </AppText>
              {status.kind !== 'even' && (
                <AppText weight="bold" color={color} style={styles.amount}>
                  {status.kind === 'get' ? '+' : '−'}
                  {formatVnd(status.amount)}
                </AppText>
              )}
            </View>
          </View>
        );
      })}

      {statuses.length > 0 && (
        <>
          <View style={styles.rule} />
          <AppText weight="semibold" color={C.muted} style={styles.label}>
            Cần chuyển
          </AppText>
          {statuses.map((transfer, index) => (
            <View key={`${transfer.from}>${transfer.to}>${index}`} style={styles.transfer}>
              <View style={styles.transferTop}>
                <AppText weight="semibold" color={C.ink} style={[styles.flex, styles.who]}>
                  {transfer.from} → {transfer.to}
                </AppText>
                <AppText weight="bold" color={C.ink} style={styles.amount}>
                  {formatVnd(transfer.amount)}
                </AppText>
              </View>
              <AppText weight="semibold" color={STATE_COLOR[transfer.state]} style={styles.meta}>
                {TRANSFER_STATE_LABEL[transfer.state]}
                {transfer.state === 'partial' ? ` · Đã trả ${formatVnd(transfer.paid)} · Còn thiếu ${formatVnd(transfer.remaining)}` : ''}
              </AppText>
            </View>
          ))}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  sheet: { width: BILL_IMAGE_WIDTH, backgroundColor: C.surface, padding: 20, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  brand: { fontSize: 12, letterSpacing: 0.3 },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 19, lineHeight: 26 },
  sub: { fontSize: 13, lineHeight: 18 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  label: { fontSize: 12.5, lineHeight: 17 },
  total: { fontSize: 30, lineHeight: 38, letterSpacing: -0.5 },
  shareCol: { alignItems: 'flex-end' },
  share: { fontSize: 16, lineHeight: 24 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, marginTop: 2 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  who: { fontSize: 15.5, lineHeight: 21 },
  meta: { fontSize: 12.5, lineHeight: 17 },
  statusCol: { alignItems: 'flex-end' },
  statusLabel: { fontSize: 12, lineHeight: 16 },
  amount: { fontSize: 15.5, lineHeight: 21 },
  transfer: { gap: 3 },
  transferTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
