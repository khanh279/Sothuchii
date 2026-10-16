import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { AmountField, FormLabel, PickButton, PickPanel, formStyles } from '@/components/expense-form-parts';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { saveFundExpenseSynced } from '@/data/fundService';
import { AppRadius } from '@/constants/palette';
import { FUND_TITLE_MAX, fundExpenseSavedMessage, overspends, validateFundExpense } from '@/domain/fundForms';
import { addToAmount } from '@/domain/expenses';
import { describeFundError } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Fund, FundExpense } from '@/types/fund';
import type { Vnd } from '@/types/money';
import { todayStr } from '@/utils/date';

/** Nút nhập nhanh như PWA: +5k … +500k (cộng dồn vào số đang có). */
const QUICK_ADDS = [
  { label: '+5k', add: 5_000 },
  { label: '+10k', add: 10_000 },
  { label: '+20k', add: 20_000 },
  { label: '+50k', add: 50_000 },
  { label: '+100k', add: 100_000 },
  { label: '+500k', add: 500_000 },
] as const;

interface Props {
  fund: Fund;
  /** Số dư của quỹ TRƯỚC khi lưu (để cảnh báo vượt quỹ). */
  balance: Vnd;
  /** Có giá trị = đang sửa khoản chi này. */
  existing?: FundExpense | null;
  onChanged: () => void;
  /**
   * 'compact' (mặc định): form gọn trong trang Quỹ. 'page': trang "Chi tiêu quỹ" mở từ nút nổi, dùng chung giao diện với trang
   * Chi tiêu cá nhân (khung form, Số tiền + nút nhanh, Nội dung, hàng Ngày | Quỹ, bảng chọn quỹ phủ lên khung).
   */
  variant?: 'compact' | 'page';
  /** Danh sách quỹ để chọn ở dạng 'page'. */
  funds?: readonly Fund[];
  onPickFund?: (fundId: string) => void;
}

/** Form chi quỹ: số tiền (ĐỒNG, nhập thẳng), nội dung, ngày. Chi vượt số dư vẫn lưu nhưng có cảnh báo. */
export function FundExpenseForm({ fund, balance, existing, onChanged, variant = 'compact', funds = [], onPickFund }: Props) {
  const colors = useColors();
  const toast = useToast();
  const today = todayStr();
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? today);
  const [error, setError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const overlayOpen = calendarOpen || pickerOpen;

  // Android: nút Back đóng lịch / bảng chọn quỹ trước khi rời màn hình.
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
    const problem = validateFundExpense({ title, date, fundId: fund.id, amount });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const result = await saveFundExpenseSynced({ id: existing?.id, fundId: fund.id, title: title.trim(), date, amount });
      if (result.value === null) {
        setError('Không tìm thấy khoản chi này. Có thể nó đã bị xoá.');
        return;
      }
      toast.show(fundExpenseSavedMessage(!!existing, overspends(balance, amount, existing?.amount ?? 0)));
      if (!existing) {
        setAmount(0);
        setTitle('');
        setDate(todayStr());
        setError('');
      }
      onChanged();
    } catch (e) {
      setError(e instanceof FundInputError ? e.message : describeFundError(e));
    } finally {
      setBusy(false);
    }
  }

  if (variant === 'page') {
    return (
      <View style={[formStyles.card, { backgroundColor: colors.surface }]}>
        <AppText weight="display" style={formStyles.title}>
          {existing ? 'Sửa khoản chi quỹ' : 'Thêm khoản chi quỹ'}
        </AppText>

        <AmountField
          value={amount}
          onChange={(value) => {
            setAmount(value);
            setError('');
          }}
        />

        <View style={formStyles.field}>
          <FormLabel>Nội dung</FormLabel>
          <TextInput
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setError('');
            }}
            maxLength={FUND_TITLE_MAX}
            placeholder="Mua nước, thuê sân…"
            placeholderTextColor={colors.muted}
            style={[formStyles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.regular }]}
          />
        </View>

        <View style={formStyles.twoCols}>
          <View style={[formStyles.field, formStyles.dateCol]}>
            <FormLabel>Ngày</FormLabel>
            <DateField value={date} onPress={() => setCalendarOpen(true)} />
          </View>
          <PickButton
            label="Quỹ"
            name={fund.name}
            icon={
              <View style={[styles.fundBadge, { backgroundColor: colors.primarySoft }]}>
                <SvgIcon name="people" size={16} color={colors.primary} strokeWidth={2} />
              </View>
            }
            onPress={() => setPickerOpen(true)}
          />
        </View>

        {!!error && (
          <AppText color={colors.danger} style={formStyles.error} accessibilityRole="alert">
            {error}
          </AppText>
        )}

        <View style={formStyles.actions}>
          <Pressable
            style={[formStyles.btn, formStyles.btnSave, { backgroundColor: colors.primary }, busy && formStyles.disabled]}
            onPress={() => void save()}
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
              setCalendarOpen(false);
            }}
          />
        )}
        {pickerOpen && (
          <PickPanel title="Chọn quỹ">
            <View style={styles.fundList}>
              {funds.map((item) => {
                const selected = item.id === fund.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onPickFund?.(item.id);
                      setPickerOpen(false);
                    }}
                    style={[styles.fundItem, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? colors.primarySoft : colors.bg }]}>
                    <View style={[styles.fundBadge, { backgroundColor: selected ? colors.surface : colors.primarySoft }]}>
                      <SvgIcon name="people" size={16} color={colors.primary} strokeWidth={2} />
                    </View>
                    <AppText weight="semibold" color={selected ? colors.primary : colors.ink} style={styles.fundItemText} numberOfLines={1}>
                      {item.name}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </PickPanel>
        )}
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <AppText weight="bold" style={styles.heading}>
        {existing ? 'Sửa khoản chi quỹ' : 'Thêm khoản chi quỹ'}
      </AppText>
      <View>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Số tiền
        </AppText>
        <AmountInput
          value={amount}
          onChangeValue={(next) => {
            setAmount(next);
            setError('');
          }}
        />
      </View>
      <View style={styles.quick}>
        {QUICK_ADDS.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={() => setAmount(addToAmount(amount, item.add))}
            style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.bg }]}>
            <AppText weight="semibold" color={colors.primary} style={styles.chipText}>
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Nội dung
        </AppText>
        <TextInput
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            setError('');
          }}
          maxLength={FUND_TITLE_MAX}
          placeholder="Ví dụ: Mua nước, thuê sân"
          placeholderTextColor={colors.muted}
          style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
        />
      </View>
      <View>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Ngày
        </AppText>
        <DateField value={date} onPress={() => setCalendarOpen(true)} />
      </View>

      {!!error && (
        <AppText color={colors.danger} style={styles.error} accessibilityRole="alert">
          {error}
        </AppText>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void save()}
        style={[styles.primary, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        <AppText weight="semibold" color={colors.primaryInk} style={styles.primaryText}>
          Lưu khoản chi
        </AppText>
      </Pressable>

      {calendarOpen && (
        <CalendarPanel
          variant="popup"
          value={date}
          today={today}
          onCancel={() => setCalendarOpen(false)}
          onConfirm={(picked) => {
            setDate(picked);
            setCalendarOpen(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  fundBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fundList: { gap: 8 },
  fundItem: { minHeight: 52, borderRadius: AppRadius.field, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fundItemText: { flex: 1, fontSize: 15.5 },
  heading: { fontSize: 16 },
  label: { fontSize: 13, marginBottom: 4 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13.5 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  error: { fontSize: 13.5 },
  primary: { minHeight: 46, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16 },
  delete: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
