import type { StyleProp, TextStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { formatVnd } from '@/utils/format';
import { useColors } from '@/hooks/use-colors';

/**
 * Số tiền của một khoản chuyển "from → to" theo QUY ƯỚC MÀU CỦA ỨNG DỤNG: tôi phải trả = "−" đỏ, người khác phải trả tôi = "+" xanh, khoản giữa hai người khác "Tôi" = không dấu, màu chữ thường.
 * Khoản đã thanh toán xong (`done`) thì mờ và GẠCH NGANG. Dùng chung ở chi tiết bill, bill gộp và bảng chọn khoản thanh toán để màu và dấu luôn nhất quán.
 */
export function TransferAmountText({ from, to, amount, done = false, style }: { from: string; to: string; amount: number; done?: boolean; style?: StyleProp<TextStyle> }) {
  const colors = useColors();
  const sign = from === BILL_OWNER_NAME ? '−' : to === BILL_OWNER_NAME ? '+' : '';
  const color = done ? colors.muted : sign === '−' ? colors.danger : sign === '+' ? colors.success : colors.ink;
  return (
    <AppText weight="bold" color={color} style={[style, done && { textDecorationLine: 'line-through' }]}>
      {sign}
      {formatVnd(amount)}
    </AppText>
  );
}
