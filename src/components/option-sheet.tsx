import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SheetFrame, useSheetClose } from '@/components/sheet-frame';
import { SvgIcon } from '@/components/svg-icon';
import type { IconName } from '@/constants/icons';
import { useColors } from '@/hooks/use-colors';

export interface SheetOption {
  icon: IconName;
  label: string;
  hint: string;
  disabled?: boolean;
  /** Mục này mở một TỜ NỔI khác: nền mờ đứng yên, tờ cũ trượt xuống rồi tờ mới hiện ra (không sáng lên rồi tối lại). */
  opensSheet?: boolean;
  onPress: () => void;
}

interface Props {
  title: string;
  options: readonly SheetOption[];
  /** Gọi sau khi tờ đã đóng xong (nền sáng lại, tờ trượt xuống) để nơi chứa gỡ tờ khỏi màn hình. */
  onClose: () => void;
  /** Dòng nhắc nhỏ dưới tiêu đề (ví dụ chưa có quỹ). */
  note?: string;
}

/**
 * Tờ chọn trượt từ đáy lên dùng chung cho nút "+" ở Tổng quan và nút "+ Giao dịch quỹ" ở Quỹ nhóm (khung `SheetFrame`: nền mờ sáng dần, tờ trượt, tay nắm).
 * Chọn một mục (mở trang hoặc mở tờ nổi khác) thì tờ trượt xuống rồi mới chạy hành động, nên tờ mới hiện ra từ từ sau khi tờ cũ đã xuống;
 * chạm nền hoặc nút Back thì chỉ đóng. Nơi chứa dựng tờ khi cần (`{open && <OptionSheet … />}`) và đóng trong `onClose`.
 */
export function OptionSheet({ title, options, onClose, note }: Props) {
  return (
    <SheetFrame onClose={onClose}>
      <OptionList title={title} options={options} note={note} onClose={onClose} />
    </SheetFrame>
  );
}

function OptionList({ title, options, onClose, note }: Props) {
  const colors = useColors();
  const hide = useSheetClose();

  return (
    <>
      <AppText weight="bold" style={styles.sheetTitle}>
        {title}
      </AppText>
      {!!note && (
        <AppText color={colors.muted} style={styles.optionHint}>
          {note}
        </AppText>
      )}
      {options.map((option, index) => (
        <Pressable
          key={option.label}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!option.disabled }}
          disabled={option.disabled}
          onPress={() => hide(option.onPress, option.opensSheet)}
          style={({ pressed }) => [
            styles.option,
            index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
            { opacity: option.disabled ? 0.45 : pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[styles.optionIcon, { backgroundColor: colors.primarySoft }]}>
            <SvgIcon name={option.icon} size={22} color={colors.primary} strokeWidth={1.9} />
          </View>
          <View style={styles.optionText}>
            <AppText weight="semibold" style={styles.optionLabel}>
              {option.label}
            </AppText>
            <AppText color={colors.muted} style={styles.optionHint}>
              {option.hint}
            </AppText>
          </View>
          <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  sheetTitle: { fontSize: 17, lineHeight: 24, marginBottom: 4 },
  option: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  optionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, minWidth: 0 },
  optionLabel: { fontSize: 15.5, lineHeight: 21 },
  optionHint: { fontSize: 12.5, lineHeight: 17 },
});
