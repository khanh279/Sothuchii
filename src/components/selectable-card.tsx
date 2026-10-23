import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';

import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

interface Props {
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}

/**
 * Thẻ chạm để chọn / bỏ chọn một đối tượng (cặp thanh toán…), đi cùng `useSelectionFilter`. Đang chọn thì nền và viền chuyển mượt sang màu chủ đạo
 * (không đổi kích thước hay vị trí nên không làm nhảy bố cục); trạng thái cũng được báo cho trình đọc màn hình.
 */
export function SelectableCard({ selected, onPress, accessibilityLabel, children }: Props) {
  const colors = useColors();
  const [progress] = useState(() => new Animated.Value(selected ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, { toValue: selected ? 1 : 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress, selected]);

  const backgroundColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, colors.primarySoft] });
  const borderColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.line, colors.primary] });

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={accessibilityLabel} onPress={onPress}>
      <Animated.View style={[styles.card, { backgroundColor, borderColor }]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: AppRadius.field, paddingHorizontal: 14, paddingVertical: 12 },
});
