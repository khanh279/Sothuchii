import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { CATEGORY_NAME_MAX, CUSTOM_COLORS, CUSTOM_ICON_IDS, MAX_CUSTOM_CATEGORIES } from '@/constants/categories';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
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
import { PERSON_NAME_LIMIT } from '@/domain/people';
import { describeStorageError, useExpenseSettings } from '@/features/expenses/hooks';
import { DataSheet } from '@/features/data/DataSheet';
import { usePeople } from '@/features/people/hooks';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import type { MonthKey } from '@/types/expense';
import { withAlpha } from '@/utils/color';
import { addMonths, monthOf, todayStr } from '@/utils/date';
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

/** Số cột của lưới chọn biểu tượng (đo từ PWA). */
const ICON_COLUMNS = 6;

/**
 * Màn Thiết lập (phần chi tiêu): ngân sách theo tháng và các mục chi riêng.
 * "Danh sách người" và "Sao lưu và dữ liệu" của PWA sẽ thêm cùng các module Quỹ / Chia bill.
 */
export default function SettingsScreen() {
  const { ref: scrollRef, props: scrollProps } = useChromeScroll();
  const today = todayStr();
  const colors = useColors();
  const { settings, loaded, error, save, reload: reloadSettings } = useExpenseSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState<MonthKey>(monthOf(today));
  const [draft, setDraft] = useState<{ month: MonthKey; value: number } | null>(null);
  const [icon, setIcon] = useState<string>('star');
  const [name, setName] = useState('');
  const { people, error: peopleError, add: addPerson, remove: removePerson, reload: reloadPeople } = usePeople();
  const [dataOpen, setDataOpen] = useState(false);
  const [personName, setPersonName] = useState('');

  const saved = budgetForMonth(settings, month);
  const budgetValue = draft && draft.month === month ? draft.value : saved;
  const nextMonth = addMonths(month, 1);
  const canNext = isBudgetMonthAllowed(nextMonth, today);
  const color = CUSTOM_COLORS[settings.cats.length % CUSTOM_COLORS.length];
  const inputStyle = [styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.regular }];

  const iconRows: string[][] = [];
  for (let i = 0; i < CUSTOM_ICON_IDS.length; i += ICON_COLUMNS) iconRows.push(CUSTOM_ICON_IDS.slice(i, i + ICON_COLUMNS) as unknown as string[]);

  async function addPersonAndNotify() {
    try {
      const result = await addPerson(personName);
      if (result.status === 'empty') return;
      if (result.status === 'me') toast.show('"Tôi" luôn có sẵn');
      else toast.show(result.status === 'added' ? `Đã thêm ${result.name}` : `${result.name} đã có trong danh sách`);
      setPersonName('');
    } catch {
      toast.show('Không ghi được danh sách người. Hãy thử lại.');
    }
  }

  async function removePersonAndNotify(person: string) {
    try {
      await removePerson(person);
      toast.show(`Đã xoá ${person} khỏi danh sách`);
    } catch {
      toast.show('Không ghi được danh sách người. Hãy thử lại.');
    }
  }

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

  // PWA xoá mục riêng ngay, không hỏi: các khoản chi trong mục giữ nguyên và hiển thị là Khác.
  async function removeCategory(id: string) {
    try {
      await save(removeCustomCategory(settings, id));
      toast.show('Đã xoá mục');
    } catch (e) {
      toast.show(describeStorageError(e));
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView ref={scrollRef} {...scrollProps} contentContainerStyle={[styles.content, { paddingBottom: 92 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={[styles.notice, { backgroundColor: colors.dangerSoft, marginTop: 12 + insets.top }]}>
            <AppText color={colors.danger} style={styles.noticeText}>
              {error}
            </AppText>
          </View>
        ) : !loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 + insets.top }} />
        ) : (
          <>
            <Section title="Danh sách người" first topInset={insets.top}>
              <Panel>
                <View style={styles.tags}>
                  {people.length === 0 ? (
                    <AppText color={colors.muted} style={styles.note}>
                      {peopleError ?? 'Chưa có ai trong danh sách'}
                    </AppText>
                  ) : (
                    people.map((person) => (
                      <View key={person} style={[styles.tag, styles.personTag, { backgroundColor: colors.surface2 }]}>
                        <AppText weight="medium" style={styles.tagText}>
                          {person}
                        </AppText>
                        <Pressable accessibilityLabel={`Xoá ${person}`} hitSlop={10} onPress={() => void removePersonAndNotify(person)}>
                          <AppText weight="bold" color={colors.danger} style={styles.tagRemove}>
                            ×
                          </AppText>
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
                <View style={styles.inline}>
                  <TextInput
                    style={[...inputStyle, styles.grow]}
                    value={personName}
                    onChangeText={setPersonName}
                    maxLength={PERSON_NAME_LIMIT}
                    onSubmitEditing={() => void addPersonAndNotify()}
                    placeholder="Tên người"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Tên người"
                  />
                  <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => void addPersonAndNotify()} accessibilityRole="button">
                    <AppText weight="semibold" color={colors.primaryInk} style={styles.buttonText}>
                      Thêm
                    </AppText>
                  </Pressable>
                </View>
              </Panel>
            </Section>

            <Section title="Ngân sách chi tiêu hàng tháng">
              <Panel>
                <View style={styles.field}>
                  <Label>Số tiền mỗi tháng (₫)</Label>
                  <View style={[styles.monthPill, { backgroundColor: colors.bg, borderColor: colors.line }]}>
                    <Pressable style={styles.arrow} accessibilityLabel="Tháng trước" onPress={() => setMonth(addMonths(month, -1))}>
                      <SvgIcon name="chevronLeft" size={18} color={colors.muted} strokeWidth={2.2} />
                    </Pressable>
                    <AppText weight="semibold" style={styles.monthLabel}>
                      {monthHeading(month)}
                    </AppText>
                    <Pressable
                      style={[styles.arrow, !canNext && styles.arrowOff]}
                      accessibilityLabel="Tháng sau"
                      disabled={!canNext}
                      onPress={() => setMonth(nextMonth)}>
                      <SvgIcon name="chevronRight" size={18} color={colors.muted} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                  <View style={styles.inline}>
                    <TextInput
                      style={[...inputStyle, styles.grow]}
                      value={budgetValue ? formatGrouped(budgetValue) : ''}
                      onChangeText={(text) => setDraft({ month, value: parseAmountInput(text) })}
                      keyboardType="number-pad"
                      placeholder="Để trống nếu không đặt"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="Ngân sách"
                    />
                    <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={saveBudget} accessibilityRole="button">
                      <AppText weight="semibold" color={colors.primaryInk} style={styles.buttonText}>
                        Lưu
                      </AppText>
                    </Pressable>
                  </View>
                  <AppText color={colors.muted} style={styles.note}>
                    {describeBudgetNote(budgetNote(settings, month), month)}
                  </AppText>
                </View>
              </Panel>
            </Section>

            <Section title="Mục chi tiêu">
              <Panel>
                <View style={styles.field}>
                  <Label>Các mục chi</Label>
                  <View style={styles.tags}>
                    {allCategories(settings).map((cat) => (
                      <View key={cat.id} style={[styles.tag, { backgroundColor: colors.surface2 }]}>
                        <CategoryIcon category={cat} size={24} glyph={15} />
                        <AppText weight="medium" style={styles.tagText}>
                          {cat.name}
                        </AppText>
                        {isCustomCategory(settings, cat.id) && (
                          <Pressable accessibilityLabel={`Xoá mục ${cat.name}`} hitSlop={10} onPress={() => removeCategory(cat.id)}>
                            <AppText weight="bold" color={colors.danger} style={styles.tagRemove}>
                              ×
                            </AppText>
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.field}>
                  <Label>Thêm mục riêng</Label>
                  <View style={styles.icons}>
                    {iconRows.map((row, rowIndex) => (
                      <View key={rowIndex} style={styles.iconRow}>
                        {row.map((id) => {
                          const selected = id === icon;
                          return (
                            <Pressable
                              key={id}
                              style={[
                                styles.iconButton,
                                selected ? { borderColor: color, backgroundColor: withAlpha(color, 0.1) } : { borderColor: 'transparent' },
                              ]}
                              accessibilityLabel={`Biểu tượng ${id}`}
                              accessibilityState={{ selected }}
                              onPress={() => setIcon(id)}>
                              <CategoryIcon category={{ id, name: id, color, icon: id }} size={36} />
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                  <View style={styles.inline}>
                    <TextInput
                      style={[...inputStyle, styles.grow]}
                      value={name}
                      onChangeText={setName}
                      maxLength={CATEGORY_NAME_MAX}
                      placeholder="Tên mục"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="Tên mục"
                    />
                    <Pressable style={[styles.button, { backgroundColor: colors.surface2 }]} onPress={addCategory} accessibilityRole="button">
                      <AppText weight="semibold" style={styles.buttonText}>
                        Thêm
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              </Panel>
              <AppText color={colors.muted} style={[styles.note, styles.footnote]}>
                Sổ đang lưu trên thiết bị này. Xoá một mục riêng thì các khoản trong mục đó chuyển sang Khác.
              </AppText>
            </Section>

            <Pressable
              accessibilityRole="button"
              onPress={() => setDataOpen(true)}
              style={[styles.dataButton, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <SvgIcon name="download" size={22} color={colors.primary} />
              <View style={styles.dataText}>
                <AppText weight="bold" style={styles.dataTitle}>
                  Sao lưu và dữ liệu
                </AppText>
                <AppText color={colors.muted} style={styles.dataSub}>
                  Lưu, khôi phục hoặc xoá dữ liệu
                </AppText>
              </View>
              <SvgIcon name="chevronRight" size={18} color={colors.muted} />
            </Pressable>
          </>
        )}
      </ScrollView>

      {dataOpen && (
        <DataSheet
          onClose={() => setDataOpen(false)}
          onDataChanged={() => {
            void reloadSettings();
            void reloadPeople();
          }}
        />
      )}
    </View>
  );
}

/** Một khối của trang: tiêu đề Bricolage 18/700, các phần cách nhau 12; khối đầu cách đỉnh 12, khối sau 8 (đo từ PWA). */
function Section({ title, first, topInset = 0, children }: { title: string; first?: boolean; topInset?: number; children: ReactNode }) {
  return (
    <View style={[styles.section, { paddingTop: first ? 12 + topInset : 8 }]}>
      <AppText weight="display" style={styles.sectionTitle}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

/** Khung trắng của PWA (`.panel`): bo 22, đệm 16, các khối cách nhau 14. */
function Panel({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.line }]}>{children}</View>;
}

function Label({ children }: { children: string }) {
  const colors = useColors();
  return (
    <AppText weight="semibold" color={colors.muted} style={styles.label}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 12 },
  notice: { padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  section: { paddingBottom: 18, gap: 12 },
  sectionTitle: { fontSize: 18, lineHeight: 26 },
  panel: { borderRadius: AppRadius.hero, borderWidth: 1, padding: 16, gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 13, lineHeight: 19 },
  monthPill: { alignSelf: 'flex-start', height: 42, borderRadius: AppRadius.pill, borderWidth: 1, padding: 3, flexDirection: 'row', alignItems: 'center', gap: 2 },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { opacity: 0.3 },
  monthLabel: { minWidth: 109, textAlign: 'center', fontSize: 14 },
  inline: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  input: { height: 46, borderRadius: AppRadius.field, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  button: { minHeight: 46, paddingHorizontal: 18, borderRadius: AppRadius.field, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15 },
  note: { fontSize: 13, lineHeight: 18.85 },
  footnote: { paddingHorizontal: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  personTag: { paddingLeft: 10 },
  dataButton: { minHeight: 64, borderRadius: AppRadius.card, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  dataText: { flex: 1, minWidth: 0 },
  dataTitle: { fontSize: 15.5 },
  dataSub: { fontSize: 12.5 },
  tag: { height: 32, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: AppRadius.pill, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagText: { fontSize: 13 },
  tagRemove: { fontSize: 16, lineHeight: 16, paddingHorizontal: 2 },
  icons: { gap: 6 },
  iconRow: { flexDirection: 'row', gap: 6 },
  iconButton: { flex: 1, height: 48, paddingVertical: 5, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
