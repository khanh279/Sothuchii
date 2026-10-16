import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { loadPeople } from '@/data/peopleRepository';
import { pickerOptions } from '@/domain/people';
import { useColors } from '@/hooks/use-colors';

interface Props {
  title: string;
  /** Tên đang có trong ô (được đánh dấu; nếu chưa có trong danh sách vẫn hiện để không mất). */
  selected: string | null;
  onPick: (name: string) => void;
  onClose: () => void;
}

/**
 * Bảng chọn MỘT người (`pickPeople` với `single` của PWA): "Tôi" đứng đầu, rồi danh sách người ở Thiết lập.
 * Chạm một tên là chọn và đóng. Tên vẫn có thể gõ tự do trong ô; bảng chỉ để chọn nhanh.
 */
export function PersonPicker({ title, selected, onPick, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPeople()
      .then((list) => !cancelled && setPeople(list))
      .catch(() => !cancelled && setPeople([])); // danh sách hỏng/không đọc được: vẫn cho chọn "Tôi" và gõ tự do
    return () => {
      cancelled = true;
    };
  }, []);

  const options = pickerOptions(people ?? [], selected);
  const empty = people !== null && people.length === 0;

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
            {options.map((name) => {
              const chosen = name === selected;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chosen }}
                  onPress={() => onPick(name)}
                  style={[styles.row, { backgroundColor: colors.bg, borderColor: chosen ? colors.primary : colors.line }]}>
                  <AppText weight="semibold" style={styles.name} numberOfLines={1}>
                    {name}
                  </AppText>
                  {chosen && <SvgIcon name="check" size={20} color={colors.primary} />}
                </Pressable>
              );
            })}
            {empty && (
              <AppText color={colors.muted} style={styles.note}>
                Chưa có ai trong danh sách người.
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
