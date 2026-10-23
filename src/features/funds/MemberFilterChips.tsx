import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { useColors } from '@/hooks/use-colors';

/** Giá trị của lựa chọn "Tất cả" (không trùng tên người nào vì tên thật không bao giờ rỗng). */
export const ALL_MEMBERS = '';

interface Props {
  members: readonly string[];
  /** ALL_MEMBERS = Tất cả. */
  value: string;
  onChange: (value: string) => void;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  const [progress] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    Animated.timing(progress, { toValue: selected ? 1 : 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress, selected]);
  const backgroundColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, colors.primary] });
  const borderColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.line, colors.primary] });
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Lọc theo ${label}`} onPress={onPress}>
      <Animated.View style={[styles.chip, { backgroundColor, borderColor }]}>
        <AppText weight="medium" color={selected ? colors.primaryInk : colors.ink} style={styles.text} numberOfLines={1}>
          {label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Hàng chọn thành viên để lọc lịch sử quỹ, cuộn ngang: "Tất cả" đứng đầu (mặc định) rồi các thành viên có thật trong lịch sử.
 * Chip đang chọn đổi nền sang màu chủ đạo mượt (không đổi kích thước nên không làm nhảy bố cục). Chỉ là bộ chọn, không biết gì về dữ liệu quỹ.
 */
export function MemberFilterChips({ members, value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" accessibilityRole="tablist">
      <Chip label="Tất cả" selected={value === ALL_MEMBERS} onPress={() => onChange(ALL_MEMBERS)} />
      {members.map((name) => (
        <Chip key={name} label={name} selected={value === name} onPress={() => onChange(value === name ? ALL_MEMBERS : name)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingVertical: 2 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 13.5 },
});
