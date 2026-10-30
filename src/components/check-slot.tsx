import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';

import { SvgIcon } from '@/components/svg-icon';
import { useColors } from '@/hooks/use-colors';

/** Bề rộng ô tích. Hàng chứa nó có `gap` (mặc định 8), nên khi thu lại ô lùi `marginRight` −gap để khoảng cách cũng về 0 (nội dung dòng không bị lệch). */
const CHECK_SLOT = 24;
const DEFAULT_GAP = 8;

/** Tiến độ 0 → 1 khi `active` bật (chạy mượt, cả lúc thu lại). */
function useSlide(active: boolean): Animated.Value {
  const [value] = useState(() => new Animated.Value(active ? 1 : 0));
  useEffect(() => {
    Animated.timing(value, { toValue: active ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, active]);
  return value;
}

/**
 * Ô tích trượt ra từ mép trái dòng khi `active` (chế độ chọn), thu lại khi tắt; đặt TRƯỚC nội dung dòng trong một hàng ngang. `disabled`: dòng không chọn được (ô vẫn chiếm chỗ nhưng ẩn,
 * để các dòng thẳng hàng). Cùng kiểu với ô tích khi gộp bill.
 */
export function CheckSlot({ active, checked, disabled = false, gap = DEFAULT_GAP, label, onToggle }: { active: boolean; checked: boolean; disabled?: boolean; gap?: number; label: string; onToggle: () => void }) {
  const colors = useColors();
  const slide = useSlide(active);
  return (
    <Animated.View
      pointerEvents={active && !disabled ? 'auto' : 'none'}
      accessibilityElementsHidden={!active || disabled}
      importantForAccessibility={active && !disabled ? 'auto' : 'no-hide-descendants'}
      style={[styles.slot, { width: slide.interpolate({ inputRange: [0, 1], outputRange: [0, CHECK_SLOT] }), marginRight: slide.interpolate({ inputRange: [0, 1], outputRange: [-gap, 0] }), opacity: disabled ? 0 : slide }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        hitSlop={8}
        onPress={onToggle}
        style={[styles.checkbox, checked ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.line }]}>
        {checked && <SvgIcon name="check" size={16} color={colors.primaryInk} strokeWidth={2.6} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: { overflow: 'hidden', alignItems: 'flex-start', justifyContent: 'center' },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
