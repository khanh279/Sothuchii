import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/category-icon';
import {
  CATEGORY_NAME_MAX,
  CUSTOM_COLORS,
  CUSTOM_ICON_IDS,
  MAX_CUSTOM_CATEGORIES,
} from '@/constants/categories';
import { useToast } from '@/components/toast';
import { PwaColors } from '@/constants/theme';
import {
  addCustomCategory,
  allCategories,
  budgetForMonth,
  budgetNote,
  isBudgetMonthAllowed,
  isCustomCategory,
  monthHeading,
  parseAmountInput,
  removeCustomCategory,
  setBudget,
  type BudgetNote,
} from '@/domain/expenses';
import { describeStorageError, useExpenseSettings } from '@/features/expenses/hooks';
import type { MonthKey } from '@/types/expense';
import { addMonths, monthOf, todayStr } from '@/utils/date';
import { confirmAsync } from '@/utils/dialog';
import { formatGrouped, formatVnd } from '@/utils/format';

const shortMonth = (month: MonthKey) => `${Number(month.slice(5))}/${month.slice(0, 4)}`;

function describeBudgetNote(note: BudgetNote, month: MonthKey): string {
  switch (note.kind) {
    case 'starts-here':
      return `Mức này áp dụng từ tháng ${shortMonth(month)} cho đến tháng bạn đặt mức khác.`;
    case 'since':
      return `Đang theo mức đặt từ tháng ${shortMonth(note.since)}. Lưu số khác để đổi từ tháng ${shortMonth(month)}.`;
    case 'legacy':
      return `Đang theo mức chung đã đặt trước đây. Lưu số khác để đổi từ tháng ${shortMonth(month)}.`;
    case 'unset':
      return `Chưa đặt. Mức bạn lưu sẽ áp dụng từ tháng ${shortMonth(month)} trở đi.`;
  }
}

/** Màn Thiết lập (phần chi tiêu): ngân sách theo tháng và các mục chi riêng. */
export default function SettingsScreen() {
  const today = todayStr();
  const { settings, loaded, error, save } = useExpenseSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState<MonthKey>(monthOf(today));
  const [draft, setDraft] = useState<{ month: MonthKey; value: number } | null>(null);
  const [icon, setIcon] = useState<string>('star');
  const [name, setName] = useState('');

  const saved = budgetForMonth(settings, month);
  const budgetValue = draft && draft.month === month ? draft.value : saved;
  const nextMonth = addMonths(month, 1);
  const color = CUSTOM_COLORS[settings.cats.length % CUSTOM_COLORS.length];

  async function saveBudget() {
    try {
      await save(setBudget(settings, month, budgetValue));
      setDraft(null);
      toast.show(
        budgetValue
          ? `Đã đặt ${formatVnd(budgetValue)} cho ${monthHeading(month).toLowerCase()}`
          : `Đã bỏ ngân sách từ ${monthHeading(month).toLowerCase()}`,
      );
    } catch (e) {
      toast.show(describeStorageError(e));
    }
  }

  async function addCategory() {
    const result = addCustomCategory(settings, name, icon);
    if (!result.ok) {
      if (result.reason === 'duplicate') toast.show('Mục này đã có');
      else if (result.reason === 'limit') toast.show(`Tối đa ${MAX_CUSTOM_CATEGORIES} mục riêng`);
      return;
    }
    try {
      await save(result.settings);
      setName('');
      toast.show(`Đã thêm mục ${result.category.name}`);
    } catch (e) {
      toast.show(describeStorageError(e));
    }
  }

  async function removeCategory(id: string, categoryName: string) {
    const ok = await confirmAsync(
      `Xoá mục ${categoryName}?`,
      'Các khoản chi trong mục này được giữ nguyên và sẽ hiển thị là Khác.',
      'Xoá',
      true,
    );
    if (!ok) return;
    try {
      await save(removeCustomCategory(settings, id));
      toast.show('Đã xoá mục');
    } catch (e) {
      toast.show(describeStorageError(e));
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 8 + insets.top, paddingBottom: 92 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : !loaded ? (
          <ActivityIndicator color={PwaColors.primary} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Ngân sách chi tiêu hàng tháng</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Số tiền mỗi tháng (₫)</Text>
              <View style={styles.nav}>
                <Pressable style={styles.navButton} accessibilityLabel="Tháng trước" onPress={() => setMonth(addMonths(month, -1))}>
                  <Text style={styles.navArrow}>‹</Text>
                </Pressable>
                <Text style={styles.navLabel}>{monthHeading(month)}</Text>
                <Pressable
                  style={[styles.navButton, !isBudgetMonthAllowed(nextMonth, today) && styles.disabled]}
                  accessibilityLabel="Tháng sau"
                  disabled={!isBudgetMonthAllowed(nextMonth, today)}
                  onPress={() => setMonth(nextMonth)}>
                  <Text style={styles.navArrow}>›</Text>
                </Pressable>
              </View>
              <View style={styles.inline}>
                <TextInput
                  style={[styles.input, styles.grow]}
                  value={budgetValue ? formatGrouped(budgetValue) : ''}
                  onChangeText={(text) => setDraft({ month, value: parseAmountInput(text) })}
                  keyboardType="number-pad"
                  placeholder="Để trống nếu không đặt"
                  placeholderTextColor={PwaColors.muted}
                  accessibilityLabel="Ngân sách"
                />
                <Pressable style={styles.button} onPress={saveBudget}>
                  <Text style={styles.buttonText}>Lưu</Text>
                </Pressable>
              </View>
              <Text style={styles.note}>{describeBudgetNote(budgetNote(settings, month), month)}</Text>
            </View>

            <Text style={styles.sectionTitle}>Mục chi tiêu</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Các mục chi</Text>
              <View style={styles.tags}>
                {allCategories(settings).map((cat) => (
                  <View key={cat.id} style={styles.tag}>
                    <CategoryIcon category={cat} size={26} />
                    <Text style={styles.tagText}>{cat.name}</Text>
                    {isCustomCategory(settings, cat.id) && (
                      <Pressable
                        accessibilityLabel={`Xoá mục ${cat.name}`}
                        hitSlop={8}
                        onPress={() => removeCategory(cat.id, cat.name)}>
                        <Text style={styles.tagRemove}>×</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>

              <Text style={[styles.label, styles.gap]}>Thêm mục riêng</Text>
              <View style={styles.icons}>
                {CUSTOM_ICON_IDS.map((id) => (
                  <Pressable
                    key={id}
                    style={[styles.iconButton, id === icon && { borderColor: color, backgroundColor: color + '1A' }]}
                    accessibilityLabel={`Biểu tượng ${id}`}
                    accessibilityState={{ selected: id === icon }}
                    onPress={() => setIcon(id)}>
                    <CategoryIcon category={{ id, name: id, color, icon: id }} size={36} />
                  </Pressable>
                ))}
              </View>
              <View style={styles.inline}>
                <TextInput
                  style={[styles.input, styles.grow]}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                  }}
                  maxLength={CATEGORY_NAME_MAX}
                  placeholder="Tên mục"
                  placeholderTextColor={PwaColors.muted}
                  accessibilityLabel="Tên mục"
                />
                <Pressable style={[styles.button, styles.buttonGhost]} onPress={addCategory}>
                  <Text style={[styles.buttonText, styles.buttonGhostText]}>Thêm</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.footnote}>
              Sổ đang lưu trên thiết bị này. Xoá một mục riêng thì các khoản trong mục đó chuyển sang Khác.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PwaColors.bg },
  content: { paddingHorizontal: 12, gap: 12 },
  notice: { padding: 16, borderRadius: 16, backgroundColor: PwaColors.dangerSoft },
  noticeText: { color: PwaColors.danger, fontSize: 15 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: PwaColors.ink, marginTop: 8 },
  card: {
    backgroundColor: PwaColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PwaColors.line,
    padding: 16,
    gap: 10,
  },
  label: { fontSize: 13, fontWeight: '600', color: PwaColors.muted },
  gap: { marginTop: 8 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: {
    width: 44,
    height: 40,
    borderRadius: 12,
    backgroundColor: PwaColors.bg,
    borderWidth: 1,
    borderColor: PwaColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: { fontSize: 22, color: PwaColors.ink, lineHeight: 24 },
  navLabel: { fontSize: 15, fontWeight: '700', color: PwaColors.ink },
  disabled: { opacity: 0.35 },
  inline: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  input: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PwaColors.line,
    backgroundColor: PwaColors.bg,
    fontSize: 16,
    color: PwaColors.ink,
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: PwaColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: PwaColors.primaryInk, fontSize: 16, fontWeight: '600' },
  buttonGhost: { backgroundColor: PwaColors.surface2 },
  buttonGhostText: { color: PwaColors.ink },
  note: { fontSize: 13, color: PwaColors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PwaColors.line,
    backgroundColor: PwaColors.bg,
  },
  tagText: { fontSize: 13, color: PwaColors.ink },
  tagRemove: { fontSize: 18, color: PwaColors.danger, lineHeight: 20, paddingLeft: 2 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  iconButton: { padding: 5, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  footnote: { fontSize: 13, color: PwaColors.muted, paddingHorizontal: 4 },
});
