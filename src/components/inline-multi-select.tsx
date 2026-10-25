import { useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

/** Chiều cao một hàng lựa chọn (46 + đường kẻ) và của dòng "không có lựa chọn": để mở / thu gọn bằng cách đổi chiều cao từ từ. */
const OPTION_ROW_HEIGHT = 46 + StyleSheet.hairlineWidth;
const EMPTY_HEIGHT = 40;

export interface InlineMultiOption {
  key: string;
  name: string;
  /** Không bỏ chọn được (vd. "Tôi" luôn nằm trong bill). */
  locked?: boolean;
}

/** Dòng cuối danh sách KHÔNG phải ô tích (vd. "Thành viên ngoài danh sách"): bấm là chạy `onPress` (cha đổi cả ô sang chế độ khác). */
export interface InlineMultiExtra {
  label: string;
  onPress: () => void;
}

interface Props {
  options: readonly InlineMultiOption[];
  extra?: InlineMultiExtra;
  /** true: danh sách đã xổ sẵn ngay khi hiện (vd. vừa quay lại từ chế độ nhập số người). */
  initiallyOpen?: boolean;
  /** Các khoá đang được chọn. */
  selectedKeys: readonly string[];
  /** Chạm một dòng: đổi chọn / bỏ chọn dòng đó (danh sách vẫn mở). */
  onToggle: (key: string) => void;
  /** Biểu tượng bên trái ô tóm tắt. */
  icon?: ReactNode;
  /** Chữ tóm tắt ở ô (vd. "Tôi, An, Bình"); rỗng thì hiện `placeholder`. */
  summary: string;
  placeholder?: string;
  accessibilityLabel: string;
  /** Hiện khi không có lựa chọn nào. */
  emptyText?: string;
}

/**
 * Ô chọn NHIỀU mục xổ xuống trong MỘT khung (cùng dáng với `InlineSelect`): hàng đầu là tóm tắt những mục đã chọn kèm mũi tên; bấm thì TOÀN BỘ danh sách xổ ngay bên dưới,
 * mỗi dòng có vòng tròn (đã chọn: nền chủ đạo kèm dấu tích). Chạm dòng chỉ đổi chọn, KHÔNG tự đóng; chỉ bấm lại hàng đầu mới thu gọn.
 */
export function InlineMultiSelect({ options, extra, initiallyOpen = false, selectedKeys, onToggle, icon, summary, placeholder = 'Chọn', accessibilityLabel, emptyText = 'Chưa có lựa chọn nào' }: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(initiallyOpen);
  /** Danh sách còn được vẽ (đang mở hoặc đang chạy hoạt ảnh thu gọn). */
  const [mounted, setMounted] = useState(initiallyOpen);
  const [progress] = useState(() => new Animated.Value(initiallyOpen ? 1 : 0));

  function toggleOpen() {
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

  const fullHeight = (options.length > 0 ? options.length * OPTION_ROW_HEIGHT : EMPTY_HEIGHT) + (extra ? OPTION_ROW_HEIGHT : 0);
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '-90deg'] });
  return (
    <View style={[styles.frame, { backgroundColor: colors.surface, borderColor: open ? colors.primary : colors.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${accessibilityLabel}: ${summary || placeholder}. Chạm để ${open ? 'thu gọn' : 'chọn'}`}
        onPress={toggleOpen}
        style={({ pressed }) => [styles.row, { backgroundColor: open ? colors.primarySoft : colors.bg, opacity: pressed ? 0.8 : 1 }]}
      >
        {icon}
        <AppText weight="semibold" color={summary ? colors.ink : colors.muted} style={styles.name} numberOfLines={1}>
          {summary || placeholder}
        </AppText>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <SvgIcon name="chevronRight" size={16} color={open ? colors.primary : colors.muted} strokeWidth={2} />
        </Animated.View>
      </Pressable>
      {mounted && (
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={{ overflow: 'hidden', opacity: progress, height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, fullHeight] }) }}
        >
          {options.map((option) => {
            const on = selectedKeys.includes(option.key);
            return (
              <Pressable
                key={option.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !!option.locked }}
                accessibilityLabel={option.name}
                disabled={option.locked}
                onPress={() => onToggle(option.key)}
                style={({ pressed }) => [styles.row, styles.optionRow, { borderTopColor: colors.line, backgroundColor: pressed ? colors.bg : colors.surface }]}
              >
                <View style={[styles.circle, { backgroundColor: on ? colors.primary : 'transparent', borderColor: on ? colors.primary : colors.line, opacity: option.locked ? 0.55 : 1 }]}>
                  {on && <SvgIcon name="check" size={14} color={colors.primaryInk} strokeWidth={2.8} />}
                </View>
                <AppText weight="medium" style={styles.name} numberOfLines={1}>
                  {option.name}
                </AppText>
              </Pressable>
            );
          })}
          {options.length === 0 && (
            <AppText color={colors.muted} style={styles.empty}>
              {emptyText}
            </AppText>
          )}
          {extra && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={extra.label}
              onPress={() => {
                extra.onPress();
                toggleOpen();
              }}
              style={({ pressed }) => [styles.row, styles.optionRow, { borderTopColor: colors.line, backgroundColor: pressed ? colors.bg : colors.surface }]}
            >
              <View style={[styles.circle, { borderColor: colors.line }]}>
                <SvgIcon name="plus" size={14} color={colors.muted} strokeWidth={2.4} />
              </View>
              <AppText weight="medium" style={styles.name} numberOfLines={1}>
                {extra.label}
              </AppText>
              <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
            </Pressable>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: AppRadius.field, borderWidth: 1, overflow: 'hidden' },
  row: { minHeight: 46, paddingVertical: 6, paddingLeft: 6, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingLeft: 12 },
  name: { flex: 1, minWidth: 0, fontSize: 15 },
  circle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 10, paddingHorizontal: 12, fontSize: 13 },
});
