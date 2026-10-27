import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/design';

interface Props {
  /** Hiện khi có đối tượng hợp lệ đang chọn và còn khoản phải thanh toán. */
  visible: boolean;
  label?: string;
  onPress: () => void;
  /** Hiện nhưng mờ và không bấm được (ví dụ chưa chọn đủ bill để gộp). */
  disabled?: boolean;
  /** Khoảng từ đáy màn hình tới đáy nút (chưa gồm vùng an toàn); mặc định nằm trên thanh điều hướng nổi của các tab. */
  bottom?: number;
}

/** Khoảng từ đáy màn hình tới đáy nút: nằm ngay trên thanh điều hướng nổi (cao ~56 + lề 10). */
const BOTTOM_OFFSET = 84;

/**
 * Nút hành động cố định ở cuối màn hình (mặc định "Thanh toán"), hiện / ẩn bằng mờ dần khi `visible` đổi (KHÔNG trượt dọc: trang đang trượt ngang vào màn hình, nút trượt lên thêm sẽ làm cả trang trông bị chéo). Khi ẩn không nhận chạm
 * và bị loại khỏi trình đọc màn hình. Chỉ là nút: không biết gì về cách tính tiền.
 */
export function PayActionBar({ visible, label = 'Thanh toán', onPress, disabled, bottom = BOTTOM_OFFSET }: Props) {
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, { toValue: visible ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress, visible]);

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.wrap, { bottom: bottom + insets.bottom, opacity: progress }]}
    >
      <PrimaryButton label={label} onPress={onPress} disabled={!visible || !!disabled} />
    </Animated.View>
  );
}

/** Đệm cuối danh sách khi nút đang hiện, để dòng cuối không bị nút che. */
export const PAY_ACTION_BAR_CLEARANCE = 64;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
});
