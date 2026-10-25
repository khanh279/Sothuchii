import { useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

/** Chiều cao một hàng lựa chọn (46 + đường kẻ) và của dòng "không còn lựa chọn": để mở / thu gọn bằng cách đổi chiều cao từ từ, phần bên dưới trượt theo thay vì nhảy một nấc. */
const OPTION_ROW_HEIGHT = 46 + StyleSheet.hairlineWidth;
const EMPTY_HEIGHT = 40;

export interface InlineSelectOption {
  key: string;
  name: string;
  /** Chữ nhỏ bên phải tên (ví dụ số dư quỹ). */
  trailing?: string;
  trailingColor?: string;
  /** Biểu tượng bên trái (thường là vòng tròn nền nhạt kèm biểu tượng). */
  icon?: ReactNode;
}

interface Props {
  /** Các lựa chọn; ô hiện lựa chọn đang chọn, bấm thì các lựa chọn CÒN LẠI xổ xuống ngay trong cùng một khung. */
  options: readonly InlineSelectOption[];
  /** Khoá lựa chọn đang chọn; không khớp lựa chọn nào (ví dụ '') = chưa chọn, ô hiện `placeholder` và mọi lựa chọn đều nằm trong danh sách. */
  selectedKey: string;
  onSelect: (key: string) => void;
  /** Nhãn trình đọc màn hình của ô, ví dụ "Quỹ". */
  accessibilityLabel: string;
  /** Chữ hiện ở ô khi chưa chọn (mặc định "Chọn"). */
  placeholder?: string;
  /** Biểu tượng của ô khi chưa chọn. */
  placeholderIcon?: ReactNode;
  /** true: danh sách đã xổ sẵn ngay khi hiện (vd. vừa quay lại từ ô nhập tên). */
  initiallyOpen?: boolean;
}

/**
 * Ô chọn xổ xuống gọn trong MỘT khung (dùng cho "Quỹ", "Hình thức chi" và "Người chi"): hàng đầu là lựa chọn hiện tại kèm mũi tên; bấm thì các lựa chọn khác hiện ngay dưới trong cùng khung,
 * cách nhau bằng đường kẻ mảnh; chọn một mục thì đổi và thu gọn.
 * Để phân biệt "đang chọn" với "danh sách": khi xổ, hàng đang chọn đổi nền xanh nhạt và khung đổi viền chủ đạo, mũi tên xoay lên, còn danh sách mở ra từ từ theo chiều cao (phần bên dưới trượt theo, không nhảy) kèm mờ dần
 * (khi thu gọn thì làm ngược lại) trên nền trắng.
 */
export function InlineSelect({ options, selectedKey, onSelect, accessibilityLabel, placeholder = 'Chọn', placeholderIcon, initiallyOpen = false }: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(initiallyOpen);
  /** Danh sách còn được vẽ (đang mở hoặc đang chạy hoạt ảnh thu gọn). */
  const [mounted, setMounted] = useState(initiallyOpen);
  const [progress] = useState(() => new Animated.Value(initiallyOpen ? 1 : 0));
  const current = options.find((option) => option.key === selectedKey) ?? null;
  const others = options.filter((option) => option.key !== current?.key);

  function toggle() {
    if (open) {
      setOpen(false);
      Animated.timing(progress, { toValue: 0, duration: 160, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    } else {
      setMounted(true);
      setOpen(true);
      Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }
  }

  const fullHeight = others.length > 0 ? others.length * OPTION_ROW_HEIGHT : EMPTY_HEIGHT;
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '-90deg'] });
  return (
    <View style={[styles.frame, { backgroundColor: colors.surface, borderColor: open ? colors.primary : colors.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${accessibilityLabel}: ${current?.name ?? placeholder}. Chạm để ${open ? 'thu gọn' : 'chọn'}`}
        onPress={toggle}
        style={({ pressed }) => [styles.row, { backgroundColor: open ? colors.primarySoft : colors.bg, opacity: pressed ? 0.8 : 1 }]}
      >
        {current ? current.icon : placeholderIcon}
        <AppText weight="semibold" color={current ? colors.ink : colors.muted} style={styles.name} numberOfLines={1}>
          {current?.name ?? placeholder}
        </AppText>
        {!!current?.trailing && (
          <AppText weight="bold" color={current.trailingColor ?? colors.muted} style={styles.trailing} numberOfLines={1}>
            {current.trailing}
          </AppText>
        )}
        <Animated.View style={{ transform: [{ rotate }] }}>
          <SvgIcon name="chevronRight" size={16} color={open ? colors.primary : colors.muted} strokeWidth={2} />
        </Animated.View>
      </Pressable>
      {mounted && (
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={{ overflow: 'hidden', opacity: progress, height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, fullHeight] }) }}
        >
          {others.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={option.name}
              onPress={() => {
                onSelect(option.key);
                toggle();
              }}
              style={({ pressed }) => [styles.row, styles.optionRow, { borderTopColor: colors.line, backgroundColor: pressed ? colors.bg : colors.surface }]}
            >
              {option.icon}
              <AppText weight="medium" style={styles.name} numberOfLines={1}>
                {option.name}
              </AppText>
              {!!option.trailing && (
                <AppText weight="bold" color={option.trailingColor ?? colors.muted} style={styles.trailing} numberOfLines={1}>
                  {option.trailing}
                </AppText>
              )}
            </Pressable>
          ))}
          {others.length === 0 && (
            <AppText color={colors.muted} style={styles.empty}>
              Không còn lựa chọn khác
            </AppText>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: AppRadius.field, borderWidth: 1, overflow: 'hidden' },
  row: { minHeight: 46, paddingVertical: 6, paddingLeft: 6, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionRow: { borderTopWidth: StyleSheet.hairlineWidth },
  name: { flex: 1, minWidth: 0, fontSize: 15 },
  trailing: { flexShrink: 0, fontSize: 14 },
  empty: { paddingVertical: 10, paddingHorizontal: 12, fontSize: 13 },
});
