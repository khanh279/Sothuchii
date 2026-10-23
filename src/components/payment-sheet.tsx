import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useColors } from '@/hooks/use-colors';

interface Props {
  /** Tiêu đề tờ nổi (mặc định "Thanh toán"). */
  title?: string;
  /** Tóm tắt đối tượng: dòng chính ("A trả B"), số tiền còn phải trả (đã định dạng) và dòng phạm vi. */
  heading: string;
  amountText: string;
  /** Dòng ghi chú phạm vi dưới số tiền; bỏ trống = không hiện. */
  scope?: string;
  /** Màu số tiền (mặc định đỏ như số còn phải trả). */
  amountColor?: string;
  /** Đóng cả luồng thanh toán (nơi dùng gỡ `PaymentSheet`). */
  onClose: () => void;
  /** Nội dung thanh toán, thường là `PaymentPanel` (nó tự dựng các tờ nổi). */
  children: ReactNode;
}

type SheetInfo = Required<Pick<Props, 'title' | 'heading' | 'amountText' | 'onClose'>> & Pick<Props, 'scope' | 'amountColor'>;

const PaymentSheetContext = createContext<SheetInfo | null>(null);

/** Thông tin của `PaymentSheet` bao quanh (null nếu bảng thanh toán nằm sẵn trong trang). */
export function usePaymentSheet(): SheetInfo | null {
  return useContext(PaymentSheetContext);
}

/** Khung tóm tắt đối tượng / số tiền còn phải trả / phạm vi, dùng ở tờ nổi và ở các trang thanh toán riêng. */
export function PaymentSummary({
  heading,
  amountText,
  scope,
  amountColor,
  surface,
}: Pick<Props, 'heading' | 'amountText' | 'scope' | 'amountColor'> & {
  surface?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.scope, { backgroundColor: surface ? colors.surface : colors.bg }]}>
      <AppText weight="semibold" style={styles.name}>
        {heading}
      </AppText>
      <AppText weight="display" color={amountColor ?? colors.danger} style={styles.total}>
        {amountText}
      </AppText>
      {!!scope && (
        <AppText color={colors.muted} style={styles.note}>
          {scope}
        </AppText>
      )}
    </View>
  );
}

/**
 * Luồng thanh toán dùng chung cho mọi nghiệp vụ (bill, công nợ, quỹ): cung cấp tóm tắt đối tượng / số tiền / phạm vi cho `PaymentPanel` bên trong,
 * panel đó dựng tờ nổi ở đáy (tóm tắt + hai nút) và tờ bước giữa màn hình (xác nhận / nhập số) bằng khung `SheetFrame`. Chỉ là khung hiển thị;
 * không biết gì về cách tính hay ghi tiền, nên đóng không tạo giao dịch nào.
 */
export function PaymentSheet({ title = 'Thanh toán', heading, amountText, scope, amountColor, onClose, children }: Props) {
  return <PaymentSheetContext.Provider value={{ title, heading, amountText, scope, amountColor, onClose }}>{children}</PaymentSheetContext.Provider>;
}

const styles = StyleSheet.create({
  scope: { borderRadius: 12, padding: 14, gap: 2 },
  name: { fontSize: 15.5, lineHeight: 21 },
  total: { fontSize: 28, lineHeight: 36, letterSpacing: -0.4 },
  note: { fontSize: 12.5, lineHeight: 17 },
});
