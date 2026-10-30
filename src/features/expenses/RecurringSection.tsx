import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput as TextInput } from '@/components/app-text-input';
import { MoneyTextInput } from '@/components/money-input';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { allCategories, newExpenseId, resolveCategory } from '@/domain/expenses';
import { dueDate } from '@/domain/recurring';
import { describeStorageError } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { ExpenseSettings } from '@/types/expense';
import { addMonths, monthOf, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Thẻ "Chi tiêu định kỳ" ở trang Thiết lập: khai báo các khoản lặp hằng tháng (tiền nhà, internet, đăng ký…) gồm số tiền, mục, nội dung và ngày trong tháng. Khi mở app, các khoản đến hạn được tự ghi vào chi tiêu
 * (mỗi tháng một khoản, đúng ngày hạn; xem `applyRecurring`). Khoản mới bắt đầu từ lần hạn tới: nếu ngày hạn của tháng này đã qua thì bắt đầu từ tháng sau, không ghi lùi. Lưu cùng thiết lập nên được sao lưu theo.
 */
export function RecurringSection({ settings, save }: { settings: ExpenseSettings; save: (next: ExpenseSettings) => Promise<void> }) {
  const colors = useColors();
  const toast = useToast();
  const rules = settings.recurring ?? [];
  const categories = allCategories(settings);
  const [amount, setAmount] = useState(0);
  const [cat, setCat] = useState(categories[0]?.id ?? 'other');
  const [note, setNote] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState('');
  const inputStyle = [styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.regular }];

  async function add() {
    const dayNumber = Math.round(Number(day));
    if (!(amount > 0)) return setError('Nhập số tiền lớn hơn 0.');
    if (!(dayNumber >= 1 && dayNumber <= 31)) return setError('Ngày trong tháng từ 1 đến 31.');
    const today = todayStr();
    const thisMonth = monthOf(today);
    const from = dueDate(thisMonth, dayNumber) > today ? thisMonth : addMonths(thisMonth, 1);
    try {
      await save({ ...settings, recurring: [...rules, { id: `r${newExpenseId(Date.now())}`, a: amount, c: cat, n: note.trim().slice(0, 80), day: dayNumber, from }] });
      setAmount(0);
      setNote('');
      setDay('');
      setError('');
      toast.show('Đã thêm chi tiêu định kỳ');
    } catch (e) {
      setError(describeStorageError(e));
    }
  }

  async function remove(id: string) {
    try {
      const next = rules.filter((rule) => rule.id !== id);
      await save({ ...settings, recurring: next.length > 0 ? next : undefined });
      toast.show('Đã xoá chi tiêu định kỳ (các khoản đã ghi giữ nguyên)');
    } catch (e) {
      setError(describeStorageError(e));
    }
  }

  return (
    <View style={styles.section}>
      <View style={[styles.panel, { backgroundColor: colors.surface }]}>
        <AppText weight="display" style={styles.title}>
          Chi tiêu định kỳ
        </AppText>
        <AppText color={colors.muted} style={styles.note}>
          Khoản lặp hằng tháng (tiền nhà, internet…) được tự ghi vào chi tiêu vào đúng ngày hạn mỗi khi bạn mở app.
        </AppText>

        {rules.map((rule) => (
          <View key={rule.id} style={[styles.saved, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <View style={styles.savedText}>
              <AppText weight="semibold" style={styles.savedTitle} numberOfLines={1}>
                {rule.n || resolveCategory(settings, rule.c).name} · {formatVnd(rule.a)}
              </AppText>
              <AppText color={colors.muted} style={styles.note} numberOfLines={1}>
                {resolveCategory(settings, rule.c).name} · ngày {rule.day} hằng tháng
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Xoá chi tiêu định kỳ ${rule.n}`} hitSlop={8} onPress={() => void remove(rule.id)} style={styles.removeButton}>
              <AppText weight="semibold" color={colors.danger} style={styles.removeText}>
                Xoá
              </AppText>
            </Pressable>
          </View>
        ))}

        <AppText weight="semibold" style={styles.subTitle}>
          Thêm khoản định kỳ
        </AppText>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Số tiền
        </AppText>
        <View style={styles.inputWrap}>
          <MoneyTextInput
            value={amount}
            onChangeValue={(value) => {
              setAmount(value);
              setError('');
            }}
            placeholder="Ví dụ: 3.000.000"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Số tiền định kỳ"
            style={[...inputStyle, styles.moneyInput]}
          />
          <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
            ₫
          </AppText>
        </View>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Mục chi
        </AppText>
        <View style={styles.chips}>
          {categories.map((category) => {
            const selected = category.id === cat;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCat(category.id)}
                style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.bg, borderColor: colors.line }]}>
                <AppText weight="semibold" color={selected ? colors.primaryInk : colors.ink} style={styles.chipText}>
                  {category.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Nội dung
        </AppText>
        <TextInput value={note} onChangeText={setNote} maxLength={80} placeholder="Ví dụ: Tiền nhà" placeholderTextColor={colors.muted} accessibilityLabel="Nội dung định kỳ" style={inputStyle} />
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Ngày trong tháng (1–31)
        </AppText>
        <TextInput
          value={day}
          onChangeText={(text) => {
            setDay(text.replace(/\D/g, '').slice(0, 2));
            setError('');
          }}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="Ví dụ: 5"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Ngày định kỳ"
          style={inputStyle}
        />
        {!!error && (
          <AppText color={colors.danger} style={styles.note} accessibilityRole="alert">
            {error}
          </AppText>
        )}
        <Pressable accessibilityRole="button" onPress={() => void add()} style={[styles.button, { backgroundColor: colors.primary }]}>
          <AppText weight="semibold" color={colors.primaryInk} style={styles.buttonText}>
            Thêm khoản định kỳ
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 6 },
  panel: { borderRadius: AppRadius.card, padding: 16, gap: 8 },
  title: { fontSize: 18, lineHeight: 24 },
  subTitle: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  note: { fontSize: 12.5, lineHeight: 17 },
  label: { fontSize: 12.5, lineHeight: 17, marginTop: 4 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  savedText: { flex: 1, minWidth: 0 },
  savedTitle: { fontSize: 15, lineHeight: 21 },
  removeButton: { paddingHorizontal: 6, paddingVertical: 4 },
  removeText: { fontSize: 14 },
  inputWrap: { justifyContent: 'center' },
  moneyInput: { paddingRight: 36 },
  suffix: { position: 'absolute', right: 14, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: AppRadius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, lineHeight: 18 },
  input: { minHeight: 46, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, fontSize: 16 },
  button: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 15 },
});
