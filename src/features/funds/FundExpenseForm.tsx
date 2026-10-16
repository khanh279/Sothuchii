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
import { createAdvanceSynced, saveFundExpenseSynced } from '@/data/fundService';
import { AppRadius } from '@/constants/palette';
import { FUND_TITLE_MAX, fundExpenseSavedMessage, overspends, validateFundExpense } from '@/domain/fundForms';
import { addToAmount, newExpenseId } from '@/domain/expenses';
import type { ExpenseKind } from '@/domain/fundAdvance';
import { OptionPicker } from '@/features/debts/OptionPicker';
import { describeFundError } from '@/features/funds/hooks';
import { PersonPicker } from '@/features/people/PersonPicker';
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
  /** Hiện tiêu đề của form (mặc định có). Tắt khi nơi chứa (màn hình / tờ nổi) đã có tiêu đề riêng, để không trùng. */
  showTitle?: boolean;
  /** Danh sách quỹ để chọn ở dạng 'page'. */
  funds?: readonly Fund[];
  onPickFund?: (fundId: string) => void;
}

/** Ba hình thức chi quỹ (thứ tự và tên theo nghiệp vụ); mặc định khi mở form là quỹ chi trực tiếp. */
const KIND_OPTIONS: { kind: ExpenseKind; label: string; icon: 'wallet' | 'person' | 'tabTransactions' }[] = [
  { kind: 'direct', label: 'Quỹ chi trực tiếp', icon: 'wallet' },
  { kind: 'personal', label: 'Cá nhân ứng tiền chi trước', icon: 'person' },
  { kind: 'advance', label: 'Quỹ giao tiền ứng trước', icon: 'tabTransactions' },
];

/**
 * Hai trường bổ sung của form chi quỹ (chỉ khi THÊM MỚI): "Hình thức chi" và, với hai hình thức liên quan đến cá nhân, "Người chi" /
 * "Người nhận ứng" (chọn từ danh sách người có sẵn, như khi đóng quỹ). Hình thức trực tiếp không hiện thêm trường nào.
 */
function KindFields({ kind, person, onKind, onPerson }: { kind: ExpenseKind; person: string; onKind: () => void; onPerson: () => void }) {
  const colors = useColors();
  const current = KIND_OPTIONS.find((option) => option.kind === kind) ?? KIND_OPTIONS[0];
  return (
    <>
      <View style={formStyles.field}>
        <FormLabel>Hình thức chi</FormLabel>
        <Pressable style={[formStyles.pickCurrent, { backgroundColor: colors.bg, borderColor: colors.line }]} onPress={onKind} accessibilityRole="button" accessibilityLabel={`Hình thức chi: ${current.label}`}>
          <View style={[styles.fundBadge, { backgroundColor: colors.primarySoft }]}>
            <SvgIcon name={current.icon} size={16} color={colors.primary} strokeWidth={2} />
          </View>
          <AppText weight="semibold" style={formStyles.pickName} numberOfLines={1}>
            {current.label}
          </AppText>
          <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
        </Pressable>
      </View>
      {kind !== 'direct' && (
        <View style={formStyles.field}>
          <FormLabel>{kind === 'personal' ? 'Người chi' : 'Người nhận tiền ứng'}</FormLabel>
          <Pressable style={[formStyles.pickCurrent, { backgroundColor: colors.bg, borderColor: colors.line }]} onPress={onPerson} accessibilityRole="button" accessibilityLabel={`${kind === 'personal' ? 'Người chi' : 'Người nhận tiền ứng'}: ${person || 'chưa chọn'}`}>
            <View style={[styles.fundBadge, { backgroundColor: colors.primarySoft }]}>
              <SvgIcon name="person" size={16} color={colors.primary} strokeWidth={2} />
            </View>
            <AppText weight="semibold" color={person ? colors.ink : colors.muted} style={formStyles.pickName} numberOfLines={1}>
              {person || 'Chọn người'}
            </AppText>
            <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
          </Pressable>
        </View>
      )}
    </>
  );
}

/** Form chi quỹ: hình thức chi, số tiền (ĐỒNG, nhập thẳng), nội dung, ngày. Chi vượt số dư vẫn lưu nhưng có cảnh báo. */
export function FundExpenseForm({ fund, balance, existing, onChanged, variant = 'compact', funds = [], onPickFund, showTitle = true }: Props) {
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
  const [kind, setKind] = useState<ExpenseKind>('direct');
  const [person, setPerson] = useState('');
  const [kindOpen, setKindOpen] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  // Mã bản ghi sinh MỘT LẦN cho mỗi lần nhập: bấm lưu nhiều lần hoặc thử lại sau lỗi không tạo bản ghi trùng.
  const [clientId, setClientId] = useState(() => newExpenseId(Date.now()));
  const adding = !existing;
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
    const mode: ExpenseKind = adding ? kind : 'direct';
    // Giao tiền ứng cho phép số tiền 0 (giao việc nhưng chưa cấp tiền); các hình thức còn lại giữ đúng kiểm tra cũ.
    const problem =
      mode === 'advance'
        ? !person
          ? 'Chọn người nhận tiền ứng.'
          : !title.trim()
            ? 'Nhập nội dung.'
            : !date
              ? 'Chọn ngày giao.'
              : amount < 0
                ? 'Số tiền giao không hợp lệ.'
                : null
        : mode === 'personal' && !person
          ? 'Chọn người chi.'
          : validateFundExpense({ title, date, fundId: fund.id, amount });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'advance') {
        await createAdvanceSynced({ clientId, fundId: fund.id, person, title: title.trim(), date, amount });
        toast.show('Đã ghi nhận giao tiền ứng');
      } else {
        const result = await saveFundExpenseSynced({
          id: existing?.id,
          clientId: existing ? undefined : clientId,
          fundId: fund.id,
          title: title.trim(),
          date,
          amount,
          ...(mode === 'personal' ? { mode: 'personal' as const, payer: person } : {}),
        });
        if (result.value === null) {
          setError('Không tìm thấy khoản chi này. Có thể nó đã bị xoá.');
          return;
        }
        toast.show(fundExpenseSavedMessage(!!existing, overspends(balance, amount, existing?.amount ?? 0)));
      }
      if (!existing) {
        setAmount(0);
        setTitle('');
        setDate(todayStr());
        setError('');
        setKind('direct');
        setPerson('');
        setClientId(newExpenseId(Date.now()));
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
        {showTitle && (
          <AppText weight="display" style={formStyles.title}>
            {existing ? 'Sửa chi tiêu quỹ' : 'Chi tiêu quỹ'}
          </AppText>
        )}

        {adding && <KindFields kind={kind} person={person} onKind={() => setKindOpen(true)} onPerson={() => setPersonOpen(true)} />}

        <AmountField
          label={adding && kind === 'advance' ? 'Số tiền giao' : 'Số tiền'}
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
              {adding && kind === 'advance' ? 'Lưu khoản giao tiền' : 'Lưu khoản chi'}
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
      {kindOpen && (
        <OptionPicker
          title="Chọn hình thức chi"
          options={KIND_OPTIONS.map((option) => option.label)}
          selected={(KIND_OPTIONS.find((option) => option.kind === kind) ?? KIND_OPTIONS[0]).label}
          onClose={() => setKindOpen(false)}
          onPick={(label) => {
            setKind(KIND_OPTIONS.find((option) => option.label === label)?.kind ?? 'direct');
            setError('');
            setKindOpen(false);
          }}
        />
      )}
      {personOpen && (
        <PersonPicker
          title={kind === 'personal' ? 'Chọn người chi' : 'Chọn người nhận tiền ứng'}
          selected={person || null}
          onClose={() => setPersonOpen(false)}
          onPick={(name) => {
            setPerson(name);
            setError('');
            setPersonOpen(false);
          }}
        />
      )}
      </View>
    );
  }

  return (
    <View style={styles.form}>
      {showTitle && (
        <AppText weight="bold" style={styles.heading}>
          {existing ? 'Sửa chi tiêu quỹ' : 'Chi tiêu quỹ'}
        </AppText>
      )}
      {adding && <KindFields kind={kind} person={person} onKind={() => setKindOpen(true)} onPerson={() => setPersonOpen(true)} />}
      <View>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          {adding && kind === 'advance' ? 'Số tiền giao' : 'Số tiền'}
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
          {adding && kind === 'advance' ? 'Lưu khoản giao tiền' : 'Lưu khoản chi'}
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
      {kindOpen && (
        <OptionPicker
          title="Chọn hình thức chi"
          options={KIND_OPTIONS.map((option) => option.label)}
          selected={(KIND_OPTIONS.find((option) => option.kind === kind) ?? KIND_OPTIONS[0]).label}
          onClose={() => setKindOpen(false)}
          onPick={(label) => {
            setKind(KIND_OPTIONS.find((option) => option.label === label)?.kind ?? 'direct');
            setError('');
            setKindOpen(false);
          }}
        />
      )}
      {personOpen && (
        <PersonPicker
          title={kind === 'personal' ? 'Chọn người chi' : 'Chọn người nhận tiền ứng'}
          selected={person || null}
          onClose={() => setPersonOpen(false)}
          onPick={(name) => {
            setPerson(name);
            setError('');
            setPersonOpen(false);
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
