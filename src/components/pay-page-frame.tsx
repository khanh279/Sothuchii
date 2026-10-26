import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

interface Props {
  /** Nhãn nhỏ phía trên số tiền (ví dụ "Tôi nợ An"). */
  label: string;
  /** Tổng số tiền đã định dạng (có dấu −/+ theo quy ước). */
  amount: string;
  /** Màu số tiền: đỏ tôi phải trả, xanh người khác phải trả tôi; bỏ trống = màu chữ thường. */
  amountColor?: string;
  /** Dòng chú thích nhỏ dưới số tiền. */
  caption?: string;
  /** Tiêu đề và số lượng của phần chi tiết (ví dụ "Các khoản bill", "3 khoản"). */
  detailsTitle?: string;
  detailsCount?: string;
  /** Dòng chú thích nhỏ nằm ngay dưới tiêu đề phần chi tiết (vd. kỳ đang xem). */
  detailsSubtitle?: string;
  /** Phần chi tiết các khoản. */
  children: ReactNode;
}

/**
 * Khung trang thanh toán dùng chung (bill, công nợ, quỹ): MỘT thẻ trắng gồm hai phần cách nhau bằng đường kẻ mảnh, từ trên xuống:
 * (1) tổng: nhãn nhỏ, số tiền lớn có màu theo quy ước, chú thích; (2) chi tiết các khoản. Nút Thanh toán cố định ở đáy trang mở tờ nổi thanh toán.
 * Chỉ là khung hiển thị, màu nền nhạt để nhìn nhẹ nhàng; không biết gì về cách tính hay ghi tiền.
 */
export function PayPageFrame({ label, amount, amountColor, caption, detailsTitle, detailsCount, detailsSubtitle, children }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.frame, { backgroundColor: colors.surface }]}>
      <View style={styles.section}>
        <AppText color={colors.muted} style={styles.label}>
          {label}
        </AppText>
        <AppText weight="display" color={amountColor ?? colors.ink} style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
          {amount}
        </AppText>
        {!!caption && (
          <AppText color={colors.muted} style={styles.label}>
            {caption}
          </AppText>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.line }]} />
      <View style={styles.section}>
        {!!detailsTitle && (
          <View style={styles.titleRow}>
            <View style={styles.titleCol}>
              <AppText weight="semibold" style={styles.title}>
                {detailsTitle}
              </AppText>
              {!!detailsSubtitle && (
                <AppText color={colors.muted} style={styles.label} numberOfLines={1}>
                  {detailsSubtitle}
                </AppText>
              )}
            </View>
            {!!detailsCount && (
              <AppText color={colors.muted} style={styles.label}>
                {detailsCount}
              </AppText>
            )}
          </View>
        )}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: AppRadius.hero, overflow: 'hidden' },
  section: { paddingHorizontal: 16, paddingVertical: 14, gap: 4 },
  divider: { height: StyleSheet.hairlineWidth },
  label: { fontSize: 13, lineHeight: 18 },
  amount: { fontSize: 30, lineHeight: 38, letterSpacing: -0.4 },
  titleCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  title: { fontSize: 15, lineHeight: 21 },
});
