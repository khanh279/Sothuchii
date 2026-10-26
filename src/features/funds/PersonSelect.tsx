import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppTextInput as TextInput } from '@/components/app-text-input';

import { AppText } from '@/components/app-text';
import { InlineSelect } from '@/components/inline-select';
import { SvgIcon } from '@/components/svg-icon';
import { AppFonts } from '@/constants/fonts';
import { PERSON_NAME_MAX } from '@/domain/fundForms';
import { useColors } from '@/hooks/use-colors';

/** Lựa chọn cuối danh sách: chuyển ô thành nơi nhập tên. */
const OTHER_KEY = '__other__';

interface Props {
  /** Những người có thể chọn (thường là người của quỹ, xem `fundMembers`). */
  members: readonly string[];
  /** Tên đang chọn / đang nhập ('' = chưa chọn). */
  value: string;
  onChange: (name: string) => void;
  accessibilityLabel: string;
}

/**
 * Ô chọn người dạng NGĂN XẾP (như các ô chọn người khác): hàng đầu là người đang chọn, bấm thì danh sách xổ ngay bên dưới; mục cuối "Thành viên khác" đổi ô thành nơi nhập tên
 * (có nút "Chọn từ danh sách" để quay lại, danh sách xổ sẵn). Dùng ở form Chi tiêu quỹ ("Người chi" / "Người nhận ứng") và hộp thoại "Không đủ số dư quỹ".
 */
export function PersonSelect({ members, value, onChange, accessibilityLabel }: Props) {
  const colors = useColors();
  const [typing, setTyping] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const badge = (
    <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
      <SvgIcon name="person" size={16} color={colors.primary} strokeWidth={2} />
    </View>
  );

  if (typing) {
    return (
      <View style={[styles.nameRow, { backgroundColor: colors.bg, borderColor: colors.line }]}>
        {badge}
        <TextInput
          value={value}
          onChangeText={onChange}
          maxLength={PERSON_NAME_MAX}
          placeholder="Nhập tên"
          placeholderTextColor={colors.muted}
          accessibilityLabel={accessibilityLabel}
          style={[styles.nameField, { color: colors.ink, fontFamily: AppFonts.semibold }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chọn từ danh sách"
          hitSlop={6}
          onPress={() => {
            setTyping(false);
            setListOpen(true);
            onChange('');
          }}
          style={styles.backRow}
        >
          <AppText weight="semibold" color={colors.primary} style={styles.backText}>
            Chọn từ danh sách
          </AppText>
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <SvgIcon name="chevronRight" size={16} color={colors.primary} strokeWidth={2} />
          </View>
        </Pressable>
      </View>
    );
  }

  const names = value && !members.includes(value) ? [value, ...members] : [...members];
  return (
    <InlineSelect
      initiallyOpen={listOpen}
      accessibilityLabel={accessibilityLabel}
      selectedKey={value}
      onSelect={(key) => {
        if (key === OTHER_KEY) {
          setListOpen(false);
          setTyping(true);
          onChange('');
        } else onChange(key);
      }}
      placeholder="Chọn người"
      placeholderIcon={badge}
      options={[...names.map((name) => ({ key: name, name, icon: badge })), { key: OTHER_KEY, name: 'Thành viên khác', icon: badge }]}
    />
  );
}

const styles = StyleSheet.create({
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  /** Ô nhập tên (sau "Thành viên khác"): cùng dáng hàng chọn người, biểu tượng bên trái và nút quay lại danh sách bên phải. */
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderWidth: 1, borderRadius: 12 },
  nameField: { flex: 1, minWidth: 0, height: 34, fontSize: 15, padding: 0 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 13 },
});
