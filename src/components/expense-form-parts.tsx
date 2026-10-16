import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { AmountInput } from '@/components/amount-input';
import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import { addToAmount } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';

/**
 * Giao diện chung của hai trang nhập "Chi tiêu cá nhân" và "Chi tiêu quỹ" (PWA: hai trang có cùng giao diện): khung form,
 * ô Số tiền kèm các nút nhập nhanh, nhãn, hàng "Ngày | Mục chi / Quỹ", bảng chọn phủ lên khung và hàng nút Lưu.
 */

/** Nút nhập nhanh, đúng như PWA: +5k … +500k và ".000" (nhân 1000). */
export const QUICK_ADDS = [
  { label: '+5k', add: 5_000 },
  { label: '+10k', add: 10_000 },
  { label: '+20k', add: 20_000 },
  { label: '+50k', add: 50_000 },
  { label: '+100k', add: 100_000 },
  { label: '+500k', add: 500_000 },
] as const;

export function FormLabel({ children }: { children: string }) {
  const colors = useColors();
  return (
    <AppText weight="semibold" color={colors.muted} style={formStyles.label}>
      {children}
    </AppText>
  );
}

export function QuickButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  const colors = useColors();
  return (
    <Pressable
      style={[formStyles.quick, { backgroundColor: colors.surface2 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}>
      <AppText weight="semibold" style={formStyles.quickText} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface AmountFieldProps {
  /** Số tiền (đồng). */
  value: number;
  /** Nhận giá trị mới (số tiền gõ vào, hoặc kết quả của nút nhanh). */
  onChange: (value: number | ((previous: number) => number)) => void;
  invalid?: boolean;
  /** Câu báo lỗi hiện dưới ô nhập khi `invalid`. */
  errorText?: string;
}

/** Ô "Số tiền" + hàng nút nhập nhanh (+5k … +500k, ".000") + câu báo lỗi. */
export function AmountField({ value, onChange, invalid = false, errorText }: AmountFieldProps) {
  const colors = useColors();
  return (
    <View style={formStyles.field}>
      <FormLabel>Số tiền</FormLabel>
      <AmountInput value={value} invalid={invalid} onChangeValue={(next) => onChange(next)} />
      <View style={formStyles.quickRow}>
        {QUICK_ADDS.map((item) => (
          <QuickButton key={item.label} label={item.label} onPress={() => onChange((previous) => addToAmount(previous, item.add))} />
        ))}
        <QuickButton label=".000" accessibilityLabel="Thêm ba số không" onPress={() => onChange((previous) => addToAmount(0, previous * 1000))} />
      </View>
      {invalid && !!errorText && (
        <AppText color={colors.danger} style={formStyles.error}>
          {errorText}
        </AppText>
      )}
    </View>
  );
}

/** Ô chọn bên phải hàng ngày ("Mục chi" / "Quỹ"): biểu tượng nhỏ + tên, bấm để mở bảng chọn. */
export function PickButton({ label, name, icon, onPress }: { label: string; name: string; icon: ReactNode; onPress: () => void }) {
  const colors = useColors();
  return (
    <View style={[formStyles.field, formStyles.pickCol]}>
      <FormLabel>{label}</FormLabel>
      <Pressable
        style={[formStyles.pickCurrent, { backgroundColor: colors.bg, borderColor: colors.line }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${name}`}>
        {icon}
        <AppText weight="semibold" style={formStyles.pickName} numberOfLines={1}>
          {name}
        </AppText>
      </Pressable>
    </View>
  );
}

/** Khung bảng chọn phủ kín khung form (`.pick-grid`), lệch 4px mỗi cạnh như lịch; nội dung do trang truyền vào. */
export function PickPanel({ title, children, style }: { title: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View style={[formStyles.pickPanel, { backgroundColor: colors.surface }, style]} accessibilityViewIsModal>
      <AppText weight="display" style={formStyles.pickTitle}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

export const formStyles = StyleSheet.create({
  /** Khung form: bo 22, đệm 16, các khối cách nhau 16 (đo từ PWA). */
  card: { borderRadius: AppRadius.hero, padding: 16, gap: 16 },
  title: { fontSize: 18, lineHeight: 26 },
  field: { gap: 6 },
  label: { fontSize: 13, lineHeight: 19 },
  quickRow: { flexDirection: 'row', gap: 4 },
  quick: { flex: 1, height: 33, borderRadius: AppRadius.pill, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 12 },
  input: { height: 46, borderRadius: AppRadius.field, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  twoCols: { flexDirection: 'row', gap: 8 },
  dateCol: { flex: 1.25 },
  pickCol: { flex: 1 },
  pickCurrent: {
    height: 46,
    borderRadius: AppRadius.field,
    borderWidth: 1,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickName: { flex: 1, fontSize: 15 },
  error: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { height: 46, borderRadius: AppRadius.field, alignItems: 'center', justifyContent: 'center' },
  btnSave: { flex: 1 },
  btnDelete: { paddingHorizontal: 18 },
  btnText: { fontSize: 15 },
  disabled: { opacity: 0.6 },
  pickPanel: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, zIndex: 6, padding: 16, gap: 8, borderRadius: 21 },
  pickTitle: { fontSize: 18, lineHeight: 33 },
});
