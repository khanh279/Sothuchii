import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { loadPeople } from '@/data/peopleRepository';
import { memberOptions } from '@/domain/people';
import { useColors } from '@/hooks/use-colors';

interface Props {
  title: string;
  /** Tên đang được chọn (không kể "Tôi", luôn được chọn). */
  selected: readonly string[];
  /** Gọi ngay mỗi lần chạm một tên, với danh sách đang chọn theo thứ tự của bảng (như PWA). */
  onChange: (selected: string[]) => void;
  onClose: () => void;
}

/**
 * Bảng chọn NHIỀU người (`pickPeople` với `includeMe` và `lockMe` của PWA): "Tôi" luôn được chọn và không bỏ được,
 * rồi các người trong Danh sách người. Mỗi lần chạm cập nhật ngay; nút "Xong (N người)" chỉ để đóng bảng.
 */
export function MemberPicker({ title, selected, onChange, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<string[]>(() => selected.filter((name) => name !== 'Tôi'));
  const [initial] = useState(selected);

  useEffect(() => {
    let cancelled = false;
    loadPeople()
      .then((list) => !cancelled && setPeople(list))
      .catch(() => !cancelled && setPeople([])); // danh sách hỏng/không đọc được: vẫn cho chọn các tên đang có
    return () => {
      cancelled = true;
    };
  }, []);

  const options = memberOptions(people ?? [], initial);
  const isChosen = (name: string) => name === 'Tôi' || chosen.includes(name);
  const count = options.filter(isChosen).length;

  function toggle(name: string) {
    if (name === 'Tôi') return;
    const next = chosen.includes(name) ? chosen.filter((item) => item !== name) : [...chosen, name];
    setChosen(next);
    onChange(options.filter((option) => option !== 'Tôi' && next.includes(option)));
  }

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
              const on = isChosen(name);
              return (
                <Pressable
                  key={name}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: name === 'Tôi' }}
                  disabled={name === 'Tôi'}
                  onPress={() => toggle(name)}
                  style={[styles.row, { backgroundColor: on ? colors.primarySoft : colors.bg, borderColor: on ? colors.primary : colors.line }]}>
                  <AppText weight="semibold" style={styles.name} numberOfLines={1}>
                    {name}
                  </AppText>
                  <View style={[styles.tick, { backgroundColor: on ? colors.primary : 'transparent', borderColor: on ? colors.primary : colors.line, opacity: name === 'Tôi' ? 0.55 : 1 }]}>
                    {on && <SvgIcon name="check" size={18} color={colors.primaryInk} strokeWidth={2.6} />}
                  </View>
                </Pressable>
              );
            })}
            {people !== null && people.length === 0 && (
              <AppText color={colors.muted} style={styles.note}>
                Chưa có ai trong danh sách người. Thêm người ở mục Thiết lập.
              </AppText>
            )}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.done, { backgroundColor: colors.primary }]}>
            <AppText weight="semibold" color={colors.primaryInk} style={styles.doneText}>
              Xong ({count} người)
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 8, paddingTop: 8 },
  title: { fontSize: 17 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24 },
  list: { paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  row: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontSize: 16 },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13, paddingVertical: 6, paddingHorizontal: 4 },
  done: { marginHorizontal: 14, marginTop: 4, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 16 },
});
