import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountInput } from '@/components/amount-input';
import { useToast } from '@/components/toast';
import { CategoryIcon } from '@/components/category-icon';
import { DateField } from '@/components/date-field';
import { DEFAULT_CATEGORY_ID, MEMO_MAX } from '@/constants/categories';
import { PwaColors } from '@/constants/theme';
import { addExpense, deleteExpense, getExpense, updateExpense } from '@/data/expenseRepository';
import {
  addToAmount,
  allCategories,
  buildExpense,
  periodFromParams,
  resolveCategory,
  savedMessage,
  validateExpenseInput,
} from '@/domain/expenses';
import { describeStorageError, useExpenseSettings } from '@/features/expenses/hooks';
import type { ExpenseRef, ExpenseSettings, ExpenseWithId, Period } from '@/types/expense';
import { isValidDateStr, monthOf, todayStr } from '@/utils/date';
import { confirmAsync } from '@/utils/dialog';

/** Quay lại màn trước; nếu không có màn trước (mở thẳng trang này) thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Nút nhập nhanh, đúng như PWA: +5k … +500k và ".000" (nhân 1000). */
const QUICK_ADDS = [
  { label: '+5k', add: 5_000 },
  { label: '+10k', add: 10_000 },
  { label: '+20k', add: 20_000 },
  { label: '+50k', add: 50_000 },
  { label: '+100k', add: 100_000 },
  { label: '+500k', add: 500_000 },
] as const;

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; existing: ExpenseWithId | null };

/**
 * Màn hình thêm / sửa khoản chi.
 * Tham số route: `m` + `id` (sửa khoản đã có) hoặc `d` (ngày gợi ý khi thêm mới).
 */
export default function ExpenseFormScreen() {
  const params = useLocalSearchParams<{ m?: string; id?: string; d?: string; mode?: string; month?: string; year?: string; from?: string; to?: string }>();
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

  const title = ref ? 'Sửa khoản chi' : 'Thêm khoản chi';
  let body;
  if (settingsError) body = <Notice text={settingsError} />;
  else if (expense.status === 'error') body = <Notice text={expense.message} />;
  else if (!settingsLoaded || expense.status === 'loading') body = <ActivityIndicator style={styles.loading} color={PwaColors.primary} />;
  else if (ref && !expense.existing) body = <Notice text="Không tìm thấy khoản chi này. Có thể nó đã bị xoá." />;
  else body = <ExpenseForm settings={settings} existing={expense.existing} suggestedDate={params.d} period={period} />;

  return (
    <View style={[styles.flex, { paddingTop: 4 + insets.top }]}>
      <Stack.Screen options={{ title, headerShown: false }} />
      {body}
    </View>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
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
  const today = todayStr();
  const toast = useToast();
  const [amount, setAmount] = useState(existing?.a ?? 0);
  const [memo, setMemo] = useState(existing?.n ?? '');
  const [date, setDate] = useState(
    existing?.d ?? (suggestedDate && isValidDateStr(suggestedDate) && suggestedDate <= today ? suggestedDate : today),
  );
  const [categoryId, setCategoryId] = useState(existing ? resolveCategory(settings, existing.c).id : DEFAULT_CATEGORY_ID);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState({ amount: false, date: false });
  const [busy, setBusy] = useState(false);

  const category = resolveCategory(settings, categoryId);

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
    const ok = await confirmAsync('Xoá khoản chi', 'Khoản chi này sẽ bị xoá và không khôi phục được.', 'Xoá', true);
    if (!ok) return;
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
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>Số tiền</Text>
          <AmountInput
            value={amount}
            invalid={errors.amount}
            autoFocus={!existing}
            onChangeValue={(value) => {
              setAmount(value);
              setErrors((prev) => ({ ...prev, amount: false }));
            }}
          />
          <View style={styles.quickRow}>
            {QUICK_ADDS.map((item) => (
              <Pressable key={item.label} style={styles.quick} onPress={() => setAmount((prev) => addToAmount(prev, item.add))}>
                <Text style={styles.quickText}>{item.label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.quick} accessibilityLabel="Thêm ba số không" onPress={() => setAmount((prev) => addToAmount(0, prev * 1000))}>
              <Text style={styles.quickText}>.000</Text>
            </Pressable>
          </View>
          {errors.amount && <Text style={styles.error}>Nhập số tiền lớn hơn 0.</Text>}

          <Text style={[styles.label, styles.gap]}>Nội dung</Text>
          <TextInput
            style={styles.input}
            value={memo}
            onChangeText={setMemo}
            maxLength={MEMO_MAX}
            placeholder="Phở sáng, mừng cưới…"
            placeholderTextColor={PwaColors.muted}
          />

          <View style={styles.twoCols}>
            <View style={styles.col}>
              <Text style={styles.label}>Ngày</Text>
              <DateField
                value={date}
                max={today}
                invalid={errors.date}
                onChange={(value) => {
                  setDate(value);
                  setErrors((prev) => ({ ...prev, date: false }));
                }}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Mục chi</Text>
              <Pressable style={styles.pickCurrent} onPress={() => setPickerOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: pickerOpen }}>
                <CategoryIcon category={category} size={28} />
                <Text style={styles.pickName} numberOfLines={1}>{category.name}</Text>
                <Text style={styles.chevron}>{pickerOpen ? '▲' : '▼'}</Text>
              </Pressable>
            </View>
          </View>
          {errors.date && <Text style={styles.error}>Ngày chưa đúng. Nhập dạng dd/mm/yyyy và không sau hôm nay.</Text>}

          {pickerOpen && (
            <View style={styles.pickGrid}>
              <Text style={styles.pickTitle}>Chọn mục chi</Text>
              <View style={styles.pickWrap}>
                {allCategories(settings).map((item) => (
                  <Pressable
                    key={item.id}
                    style={[styles.pickItem, item.id === categoryId && { borderColor: item.color, backgroundColor: item.color + '1A' }]}
                    onPress={() => {
                      setCategoryId(item.id);
                      setPickerOpen(false);
                    }}>
                    <CategoryIcon category={item} size={32} />
                    <Text style={styles.pickItemName} numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {existing && (
            <Pressable style={[styles.btn, styles.btnDanger]} onPress={remove} disabled={busy}>
              <Text style={styles.btnDangerText}>Xoá</Text>
            </Pressable>
          )}
          <Pressable style={[styles.btn, styles.btnPrimary, busy && styles.disabled]} onPress={save} disabled={busy}>
            <Text style={styles.btnPrimaryText}>Lưu khoản chi</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: PwaColors.bg },
  content: { padding: 16, gap: 16 },
  loading: { marginTop: 48 },
  notice: { margin: 16, padding: 16, borderRadius: 16, backgroundColor: PwaColors.dangerSoft },
  noticeText: { color: PwaColors.danger, fontSize: 15 },
  card: {
    backgroundColor: PwaColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PwaColors.line,
    padding: 16,
    gap: 8,
  },
  label: { fontSize: 13, fontWeight: '600', color: PwaColors.muted },
  gap: { marginTop: 8 },
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
  quickRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  quick: { flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: PwaColors.surface2, alignItems: 'center' },
  quickText: { fontSize: 12, fontWeight: '600', color: PwaColors.ink },
  error: { color: PwaColors.danger, fontSize: 13 },
  twoCols: { flexDirection: 'row', gap: 12, marginTop: 8 },
  col: { flex: 1, gap: 6 },
  pickCurrent: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PwaColors.line,
    backgroundColor: PwaColors.bg,
  },
  pickName: { flex: 1, fontSize: 15, color: PwaColors.ink },
  chevron: { fontSize: 10, color: PwaColors.muted },
  pickGrid: { marginTop: 8, gap: 8 },
  pickTitle: { fontSize: 13, fontWeight: '600', color: PwaColors.muted },
  pickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickItem: {
    width: '23%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pickItemName: { fontSize: 11, color: PwaColors.ink },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnPrimary: { flex: 1, backgroundColor: PwaColors.primary },
  btnPrimaryText: { color: PwaColors.primaryInk, fontSize: 16, fontWeight: '600' },
  btnDanger: { backgroundColor: PwaColors.dangerSoft },
  btnDangerText: { color: PwaColors.danger, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
