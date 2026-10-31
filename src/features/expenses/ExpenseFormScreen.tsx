import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { AppTextInput as TextInput } from '@/components/app-text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { CategoryIcon } from '@/components/category-icon';
import { DateField } from '@/components/date-field';
import { PhotoField } from '@/features/photos/PhotoViews';
import { ScreenTitle } from '@/components/design';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { AmountField, FormLabel, formStyles, FormSaveButton } from '@/components/expense-form-parts';
import { InlineSelect } from '@/components/inline-select';
import { useToast } from '@/components/toast';
import { DEFAULT_CATEGORY_ID, MEMO_MAX } from '@/constants/categories';
import { AppFonts } from '@/constants/fonts';
import { addExpense, getExpense, updateExpense } from '@/data/expenseRepository';
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
import type { ExpenseRef, ExpenseSettings, ExpenseWithId, Period } from '@/types/expense';
import { isValidDateStr, monthOf, todayStr } from '@/utils/date';
import { clearQuickDraft, peekQuickDraft } from '@/utils/quick-draft';
import { router } from '@/utils/safe-router';

/** Quay lại màn trước; nếu không có màn trước (mở thẳng trang này) thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

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

  // Trang riêng: không có thanh điều hướng; tiêu đề màn hình ("Thêm chi tiêu" / "Sửa chi tiêu") nằm ở đầu trang như các form khác.
  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: ref ? 'Sửa chi tiêu' : 'Thêm chi tiêu', headerShown: false }} />
      <ScreenTitle title={ref ? 'Sửa chi tiêu' : 'Thêm chi tiêu'} topInset={insets.top} />
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
  /** Bản nháp từ "Chụp nhanh" (chỉ khi thêm mới). */
  const [quick] = useState(() => (existing ? null : peekQuickDraft()));
  useEffect(() => clearQuickDraft(), []);
  const [amount, setAmount] = useState(existing?.a ?? quick?.amount ?? 0);
  const [memo, setMemo] = useState(existing?.n ?? quick?.title ?? '');
  const [date, setDate] = useState(
    existing?.d ?? (suggestedDate && isValidDateStr(suggestedDate) && suggestedDate <= today ? suggestedDate : today),
  );
  const [categoryId, setCategoryId] = useState(existing ? resolveCategory(settings, existing.c).id : DEFAULT_CATEGORY_ID);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [errors, setErrors] = useState({ amount: false, date: false });
  const [busy, setBusy] = useState(false);
  /** Mã các ảnh đính kèm (hóa đơn…); lưu cùng khoản chi. */
  const [photos, setPhotos] = useState<string[]>(existing?.ph ? [...existing.ph] : (quick?.ph ?? []));

  // Android: nút Back đóng lịch trước khi rời màn hình.
  useEffect(() => {
    if (!calendarOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setCalendarOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [calendarOpen]);

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
        const updated = await updateExpense({ m: monthOf(existing.d), id: existing.id }, { a: built.a, c: built.c, n: built.n, d: built.d, ph: photos });
        if (!updated) {
          toast.show('Khoản chi này không còn nữa');
          setBusy(false);
          return;
        }
      } else {
        await addExpense(photos.length > 0 ? { ...built, ph: photos } : built);
      }
      toast.show(savedMessage({ isEdit: !!existing, amount: built.a, date: built.d, period }));
      if (existing) {
        leave();
        return;
      }
      // Thêm mới: ở lại trang để ghi tiếp (giữ ngày và mục chi), chỉ xoá số tiền và nội dung.
      setAmount(0);
      setMemo('');
      setPhotos([]);
      setErrors({ amount: false, date: false });
      setBusy(false);
    } catch (error) {
      setBusy(false);
      toast.show(describeStorageError(error));
    }
  }

  return (
      <KeyboardAwareScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={[formStyles.card, { backgroundColor: colors.surface }]}>
          <View style={formStyles.field}>
            <FormLabel>Mục chi</FormLabel>
            <InlineSelect
              accessibilityLabel="Mục chi"
              selectedKey={categoryId}
              onSelect={setCategoryId}
              options={allCategories(settings).map((item) => ({ key: item.id, name: item.name, icon: <CategoryIcon category={item} size={28} /> }))}
            />
          </View>

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
              style={[formStyles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
              value={memo}
              onChangeText={setMemo}
              maxLength={MEMO_MAX}
              placeholder="Ví dụ: Phở sáng, mừng cưới"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={formStyles.field}>
            <FormLabel>Ngày</FormLabel>
            <DateField value={date} invalid={errors.date} onPress={() => setCalendarOpen(true)} />
          </View>
          {errors.date && (
            <AppText color={colors.danger} style={formStyles.error}>
              Ngày chưa đúng. Nhập dạng dd/mm/yyyy và không sau hôm nay.
            </AppText>
          )}

          <PhotoField value={photos} onChange={setPhotos} />

          <View style={formStyles.actions}>
            <FormSaveButton label="Lưu khoản chi" busy={busy} onPress={save} />
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
        </View>
      </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
});
