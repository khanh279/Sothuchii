import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { CategoryIcon } from '@/components/category-icon';
import { DateField } from '@/components/date-field';
import { AmountField, FormLabel, PickButton, PickPanel, formStyles } from '@/components/expense-form-parts';
import { useToast } from '@/components/toast';
import { DEFAULT_CATEGORY_ID, MEMO_MAX } from '@/constants/categories';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { addExpense, deleteExpense, getExpense, updateExpense } from '@/data/expenseRepository';
import {
  allCategories,
  buildExpense,
  periodFromParams,
  resolveCategory,
  savedMessage,
  validateExpenseInput,
} from '@/domain/expenses';
import { linkedExpenseNotice } from '@/domain/linkedExpense';
import { describeStorageError, useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Category, ExpenseRef, ExpenseSettings, ExpenseWithId, Period } from '@/types/expense';
import { withAlpha } from '@/utils/color';
import { isValidDateStr, monthOf, todayStr } from '@/utils/date';

/** Quay lại màn trước; nếu không có màn trước (mở thẳng trang này) thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Bảng chọn mục có 4 cột (đo từ PWA). */
const PICK_COLUMNS = 4;

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; existing: ExpenseWithId | null };

/**
 * Màn hình thêm / sửa khoản chi.
 * Tham số route: `m` + `id` (sửa khoản đã có), `d` (ngày gợi ý khi thêm mới) và kỳ đang xem
 * (`mode`, `month`, `year`, `from`, `to`) để chọn nội dung thông báo sau khi lưu.
 */
export default function ExpenseFormScreen() {
  const params = useLocalSearchParams<{ m?: string; id?: string; d?: string; mode?: string; month?: string; year?: string; from?: string; to?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mode, month, year, from, to } = params;
  const period = useMemo(() => periodFromParams({ mode, month, year, from, to }, todayStr()), [mode, month, year, from, to]);
  const ref: ExpenseRef | null = params.m && params.id ? { m: params.m, id: params.id } : null;
  const { settings, loaded: settingsLoaded, error: settingsError } = useExpenseSettings();
  const [expense, setExpense] = useState<Loaded>(ref ? { status: 'loading' } : { status: 'ready', existing: null });

  const refMonth = ref?.m;
  const refId = ref?.id;
  useEffect(() => {
    if (!refMonth || !refId) return;
    let cancelled = false;
    getExpense({ m: refMonth, id: refId })
      .then((existing) => !cancelled && setExpense({ status: 'ready', existing }))
      .catch((error) => !cancelled && setExpense({ status: 'error', message: describeStorageError(error) }));
    return () => {
      cancelled = true;
    };
  }, [refMonth, refId]);

  // Khoản do Quỹ hoặc Chia bill/khoản trả tạo chỉ sửa được tại nguồn: báo rồi quay lại, không mở form (mở từ bất kỳ màn nào cũng chặn).
  const toast = useToast();
  const notice = expense.status === 'ready' && expense.existing ? linkedExpenseNotice(expense.existing) : null;
  const blocked = !!notice;
  useEffect(() => {
    if (!notice) return;
    toast.show(notice);
    leave();
  }, [notice, toast]);

  let body;
  if (blocked) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (settingsError) body = <Notice text={settingsError} />;
  else if (expense.status === 'error') body = <Notice text={expense.message} />;
  else if (!settingsLoaded || expense.status === 'loading') body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (ref && !expense.existing) body = <Notice text="Không tìm thấy khoản chi này. Có thể nó đã bị xoá." />;
  else body = <ExpenseForm settings={settings} existing={expense.existing} suggestedDate={params.d} period={period} />;

  // Trang riêng: không có header; khoảng đệm phía trên = 12 + vùng an toàn (4 của trang + 8 của khung, như PWA).
  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: ref ? 'Sửa khoản chi' : 'Thêm khoản chi', headerShown: false }} />
      {body}
    </View>
  );
}

function Notice({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
      <AppText color={colors.danger} style={styles.noticeText}>
        {text}
      </AppText>
    </View>
  );
}

interface FormProps {
  settings: ExpenseSettings;
  existing: ExpenseWithId | null;
  suggestedDate?: string;
  /** Kỳ đang xem ở Tổng quan, dùng để chọn nội dung thông báo sau khi lưu. */
  period: Period;
}

function ExpenseForm({ settings, existing, suggestedDate, period }: FormProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const today = todayStr();
  const [amount, setAmount] = useState(existing?.a ?? 0);
  const [memo, setMemo] = useState(existing?.n ?? '');
  const [date, setDate] = useState(
    existing?.d ?? (suggestedDate && isValidDateStr(suggestedDate) && suggestedDate <= today ? suggestedDate : today),
  );
  const [categoryId, setCategoryId] = useState(existing ? resolveCategory(settings, existing.c).id : DEFAULT_CATEGORY_ID);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState({ amount: false, date: false });
  const [busy, setBusy] = useState(false);
  /** Nút Xoá bấm lần đầu thì "lên đạn": đổi chữ, bấm lần nữa mới xoá (như PWA). */
  const [deleteArmed, setDeleteArmed] = useState(false);

  const category = resolveCategory(settings, categoryId);
  const overlayOpen = calendarOpen || pickerOpen;

  // Android: nút Back đóng lịch / bảng chọn mục trước khi rời màn hình.
  useEffect(() => {
    if (!overlayOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setCalendarOpen(false);
      setPickerOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [overlayOpen]);

  async function save() {
    if (busy) return;
    const input = { a: amount, c: categoryId, n: memo, d: date };
    const result = validateExpenseInput(input, today);
    if (!result.valid) {
      setErrors({ amount: result.amountInvalid, date: result.dateInvalid });
      return;
    }
    setBusy(true);
    try {
      const built = buildExpense(input, existing, Date.now());
      if (existing) {
        const updated = await updateExpense({ m: monthOf(existing.d), id: existing.id }, { a: built.a, c: built.c, n: built.n, d: built.d });
        if (!updated) {
          toast.show('Khoản chi này không còn nữa');
          setBusy(false);
          return;
        }
      } else {
        await addExpense(built);
      }
      toast.show(savedMessage({ isEdit: !!existing, amount: built.a, date: built.d, period }));
      leave();
    } catch (error) {
      setBusy(false);
      toast.show(describeStorageError(error));
    }
  }

  async function remove() {
    if (!existing || busy) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setBusy(true);
    try {
      await deleteExpense({ m: monthOf(existing.d), id: existing.id });
      toast.show('Đã xoá khoản chi');
      leave();
    } catch (error) {
      setBusy(false);
      toast.show(describeStorageError(error));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={[formStyles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <AppText weight="display" style={formStyles.title}>
            {existing ? 'Sửa khoản chi' : 'Thêm khoản chi'}
          </AppText>

          <AmountField
            value={amount}
            invalid={errors.amount}
            errorText="Nhập số tiền lớn hơn 0."
            onChange={(value) => {
              setAmount(value);
              setErrors((prev) => ({ ...prev, amount: false }));
            }}
          />

          <View style={formStyles.field}>
            <FormLabel>Nội dung</FormLabel>
            <TextInput
              style={[formStyles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.regular }]}
              value={memo}
              onChangeText={setMemo}
              maxLength={MEMO_MAX}
              placeholder="Phở sáng, mừng cưới…"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={formStyles.twoCols}>
            <View style={[formStyles.field, formStyles.dateCol]}>
              <FormLabel>Ngày</FormLabel>
              <DateField value={date} invalid={errors.date} onPress={() => setCalendarOpen(true)} />
            </View>
            <PickButton label="Mục chi" name={category.name} icon={<CategoryIcon category={category} size={28} />} onPress={() => setPickerOpen(true)} />
          </View>
          {errors.date && (
            <AppText color={colors.danger} style={formStyles.error}>
              Ngày chưa đúng. Nhập dạng dd/mm/yyyy và không sau hôm nay.
            </AppText>
          )}

          <View style={formStyles.actions}>
            {existing && (
              <Pressable
                style={[formStyles.btn, formStyles.btnDelete, { backgroundColor: colors.dangerSoft }]}
                onPress={remove}
                disabled={busy}
                accessibilityRole="button">
                <AppText weight="semibold" color={colors.danger} style={formStyles.btnText}>
                  {deleteArmed ? 'Chạm lần nữa để xoá' : 'Xoá'}
                </AppText>
              </Pressable>
            )}
            <Pressable
              style={[formStyles.btn, formStyles.btnSave, { backgroundColor: colors.primary }, busy && formStyles.disabled]}
              onPress={save}
              disabled={busy}
              accessibilityRole="button">
              <AppText weight="semibold" color={colors.primaryInk} style={formStyles.btnText}>
                Lưu khoản chi
              </AppText>
            </Pressable>
          </View>

          {calendarOpen && (
            <CalendarPanel
              variant="overlay"
              value={date}
              today={today}
              max={today}
              onCancel={() => setCalendarOpen(false)}
              onConfirm={(picked) => {
                setDate(picked);
                setErrors((prev) => ({ ...prev, date: false }));
                setCalendarOpen(false);
              }}
            />
          )}
          {pickerOpen && (
            <CategoryPicker
              categories={allCategories(settings)}
              selectedId={categoryId}
              onSelect={(id) => {
                setCategoryId(id);
                setPickerOpen(false);
              }}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Bảng chọn mục chi phủ lên khung form (`.pick-grid`): lưới 4 cột, mục đang chọn viền theo màu mục. */
function CategoryPicker({ categories, selectedId, onSelect }: { categories: Category[]; selectedId: string; onSelect: (id: string) => void }) {
  const rows: Category[][] = [];
  for (let i = 0; i < categories.length; i += PICK_COLUMNS) rows.push(categories.slice(i, i + PICK_COLUMNS));
  return (
    <PickPanel title="Chọn mục chi">
      <View style={styles.pickGrid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.pickRow}>
            {row.map((item) => {
          const selected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              style={[
                styles.pickItem,
                selected ? { backgroundColor: withAlpha(item.color, 0.1), borderColor: item.color } : { borderColor: 'transparent' },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={item.name}
              onPress={() => onSelect(item.id)}>
              <CategoryIcon category={item} />
              <AppText weight="medium" style={styles.pickItemName} numberOfLines={1}>
                {item.name}
              </AppText>
            </Pressable>
          );
            })}
            {Array.from({ length: PICK_COLUMNS - row.length }, (_, i) => (
              <View key={`blank-${i}`} style={styles.pickBlank} />
            ))}
          </View>
        ))}
      </View>
    </PickPanel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  pickGrid: { gap: 8 },
  pickRow: { flexDirection: 'row', gap: 8 },
  pickItem: {
    flex: 1,
    height: 85,
    borderRadius: AppRadius.field,
    borderWidth: 0.8,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    gap: 6,
  },
  pickBlank: { flex: 1 },
  pickItemName: { fontSize: 12, maxWidth: '100%' },
});
