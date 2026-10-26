import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FlagIcon } from '@/components/flag-icon';
import { SheetFrame, SheetHeader, useSheetClose } from '@/components/sheet-frame';
import { SvgIcon } from '@/components/svg-icon';
import { useColors } from '@/hooks/use-colors';
import { setLanguage, useLanguage } from '@/i18n/language';
import type { Language } from '@/i18n/translate';

/** Tên mỗi ngôn ngữ viết bằng chính ngôn ngữ đó (không dịch). */
const CHOICES: readonly { value: Language; label: string }[] = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
];

/** Tờ nổi chọn ngôn ngữ giao diện (mở bằng biểu tượng trái đất ở trang Thiết lập): chọn xong thì đổi ngay và tờ trượt xuống. */
export function LanguageSheet({ onClose }: { onClose: () => void }) {
  return (
    <SheetFrame onClose={onClose}>
      <SheetHeader title="Ngôn ngữ" />
      <Choices />
    </SheetFrame>
  );
}

function Choices() {
  const colors = useColors();
  const hide = useSheetClose();
  const language = useLanguage();
  return (
    <View style={styles.list}>
      {CHOICES.map((choice, index) => {
        const selected = choice.value === language;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => hide(() => setLanguage(choice.value))}
            style={({ pressed }) => [
              styles.row,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <FlagIcon language={choice.value} size={30} />
            <AppText weight={selected ? 'bold' : 'medium'} style={styles.label}>
              {choice.label}
            </AppText>
            {selected && <SvgIcon name="check" size={20} color={colors.primary} strokeWidth={2.2} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 6 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flex: 1, fontSize: 16, lineHeight: 22 },
});
