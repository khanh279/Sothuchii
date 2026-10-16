import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { useColors } from '@/hooks/use-colors';

interface Props {
  title: string;
  options: readonly string[];
  selected: string;
  /** Hiện khi không có lựa chọn nào (ví dụ "Chưa có người"). */
  emptyText?: string;
  onPick: (option: string) => void;
  onClose: () => void;
}

/** Bảng chọn MỘT mục từ danh sách (thay cho thẻ `<select>` của PWA). Chạm một mục là chọn và đóng. */
export function OptionPicker({ title, options, selected, emptyText = 'Chưa có lựa chọn nào.', onPick, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Đóng" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.header}>
            <AppText weight="bold" style={styles.title}>
              {title}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={styles.close}>
              <AppText weight="bold" color={colors.muted} style={styles.closeText}>
                ×
              </AppText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {options.map((option) => {
              const chosen = option === selected;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chosen }}
                  onPress={() => onPick(option)}
                  style={[styles.row, { backgroundColor: colors.bg, borderColor: chosen ? colors.primary : colors.line }]}>
                  <AppText weight="semibold" style={styles.name} numberOfLines={1}>
                    {option}
                  </AppText>
                  {chosen && <SvgIcon name="check" size={20} color={colors.primary} />}
                </Pressable>
              );
            })}
            {options.length === 0 && (
              <AppText color={colors.muted} style={styles.note}>
                {emptyText}
              </AppText>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '70%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 8, paddingTop: 8 },
  title: { fontSize: 17 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24 },
  list: { paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  row: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontSize: 16 },
  note: { fontSize: 13, paddingVertical: 6, paddingHorizontal: 4 },
});
