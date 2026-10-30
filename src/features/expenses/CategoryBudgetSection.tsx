import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { MoneyTextInput } from '@/components/money-input';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { allCategories } from '@/domain/expenses';
import { describeStorageError } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { ExpenseSettings } from '@/types/expense';

/**
 * Thẻ "Hạn mức theo mục" ở trang Thiết lập: mỗi mục chi một ô nhập hạn mức MỖI THÁNG (để trống / 0 = không đặt). Khi xem một tháng ở trang Chi tiêu, mục nào có hạn mức sẽ hiện thanh tiến độ
 * và báo vượt. Lưu cùng các thiết lập khác nên được sao lưu theo.
 */
export function CategoryBudgetSection({ settings, save }: { settings: ExpenseSettings; save: (next: ExpenseSettings) => Promise<void> }) {
  const colors = useColors();
  const toast = useToast();
  const categories = allCategories(settings);
  const [draft, setDraft] = useState<Record<string, number>>(() => ({ ...(settings.catBudgets ?? {}) }));
  const [error, setError] = useState('');

  async function submit() {
    const catBudgets: Record<string, number> = {};
    for (const category of categories) {
      const amount = Math.round(draft[category.id] ?? 0);
      if (amount > 0) catBudgets[category.id] = amount;
    }
    try {
      await save({ ...settings, catBudgets: Object.keys(catBudgets).length > 0 ? catBudgets : undefined });
      setError('');
      toast.show('Đã lưu hạn mức theo mục');
    } catch (e) {
      setError(describeStorageError(e));
    }
  }

  return (
    <View style={styles.section}>
      <View style={[styles.panel, { backgroundColor: colors.surface }]}>
        <AppText weight="display" style={styles.title}>
          Hạn mức theo mục
        </AppText>
        <AppText color={colors.muted} style={styles.note}>
          Đặt số tiền tối đa mỗi tháng cho từng mục. Khi xem một tháng ở trang Chi tiêu, mục có hạn mức sẽ hiện thanh tiến độ và báo khi vượt.
        </AppText>
        {categories.map((category) => (
          <View key={category.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: category.color }]} />
            <AppText weight="semibold" style={styles.name} numberOfLines={1}>
              {category.name}
            </AppText>
            <View style={styles.inputWrap}>
              <MoneyTextInput
                value={draft[category.id] ?? 0}
                onChangeValue={(value) => setDraft((current) => ({ ...current, [category.id]: value }))}
                placeholder="Không đặt"
                placeholderTextColor={colors.muted}
                accessibilityLabel={`Hạn mức ${category.name}`}
                style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
              />
              <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                ₫
              </AppText>
            </View>
          </View>
        ))}
        {!!error && (
          <AppText color={colors.danger} style={styles.note} accessibilityRole="alert">
            {error}
          </AppText>
        )}
        <Pressable accessibilityRole="button" onPress={() => void submit()} style={[styles.button, { backgroundColor: colors.primary }]}>
          <AppText weight="semibold" color={colors.primaryInk} style={styles.buttonText}>
            Lưu hạn mức
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
  note: { fontSize: 12.5, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, minWidth: 0, fontSize: 14.5 },
  inputWrap: { width: 150, justifyContent: 'center' },
  input: { minHeight: 42, borderWidth: 1.5, borderRadius: 12, paddingLeft: 12, paddingRight: 28, fontSize: 15, textAlign: 'right' },
  suffix: { position: 'absolute', right: 10, fontSize: 13 },
  button: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 15 },
});
