import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { AppTextInput as TextInput } from '@/components/app-text-input';

import { AmountInput } from '@/components/amount-input';
import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { PhotoField } from '@/features/photos/PhotoViews';
import { AmountField, FormLabel, PickButton, PickPanel, formStyles, FormSaveButton } from '@/components/expense-form-parts';
import { InlineSelect } from '@/components/inline-select';
import { pressStyle } from '@/components/press-feedback';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { createAdvanceSynced, saveFundExpenseSynced, updateAdvanceSynced } from '@/data/fundService';
import { AppRadius } from '@/constants/palette';
import { FUND_TITLE_MAX, fundExpenseSavedMessage, validateFundExpense } from '@/domain/fundForms';
import { newExpenseId } from '@/domain/expenses';
import type { ExpenseKind } from '@/domain/fundAdvance';
import { clearQuickDraft, peekQuickDraft } from '@/utils/quick-draft';
import { describeFundError } from '@/features/funds/hooks';
import { PersonSelect } from '@/features/funds/PersonSelect';
import { useColors } from '@/hooks/use-colors';
import type { Advance, Fund, FundExpense } from '@/types/fund';
import { todayStr } from '@/utils/date';

interface Props {
  fund: Fund;
  /** Có giá trị = đang sửa khoản chi này. */
  existing?: FundExpense | null;
  /** Có giá trị = đang sửa hồ sơ giao tiền ứng này (nội dung, ngày, số tiền giao; người nhận giữ nguyên). */
  existingAdvance?: Advance | null;
  /** Gọi khi SỬA xong một khoản chi / hồ sơ giao ứng (nơi chứa quay về trang trước). */
  onChanged: () => void;
  /** Gọi sau khi THÊM MỚI xong: form được xoá để ghi tiếp và ở lại trang; nơi chứa dùng để làm mới dữ liệu quỹ. */
  onAdded?: () => void;
  /**
   * 'compact' (mặc định): form gọn trong trang Quỹ. 'page': trang "Chi tiêu quỹ" mở từ nút nổi, dùng chung giao diện với trang
   * Chi tiêu cá nhân (khung form, Số tiền + nút nhanh, Nội dung, hàng Ngày | Quỹ, bảng chọn quỹ phủ lên khung).
   */
  variant?: 'compact' | 'page';
  /** Hiện tiêu đề của form (mặc định có). Tắt khi nơi chứa (màn hình / tờ nổi) đã có tiêu đề riêng, để không trùng. */
  showTitle?: boolean;
  /** Những người thuộc quỹ này (`fundMembers`): có thì ô "Người chi" / "Người nhận ứng" chỉ xổ chọn trong số họ; bỏ trống = chọn trong danh sách người chung như cũ. */
  members?: readonly string[];
  /** Những người đang giữ tiền quỹ giao mà chưa chi hết: có thì "Giao cá nhân chi" hỏi thêm "Quỹ giao cá nhân" hay "Chi từ khoản đã giao". */
  heldPersons?: readonly string[];
  /** Chia khoản chi của một người vào các lần giao ứng của họ (cũ nhất trước): `planAdvanceSpend` của dữ liệu quỹ hiện tại. */
  planSpend?: (person: string, amount: number) => { advanceId: string; fundId: string; amount: number }[];
  /** Danh sách quỹ để chọn ở dạng 'page'. */
  funds?: readonly Fund[];
  onPickFund?: (fundId: string) => void;
}

/** Ba hình thức chi quỹ (thứ tự và tên theo nghiệp vụ); mặc định khi mở form là quỹ chi trực tiếp. */
const KIND_OPTIONS: { kind: ExpenseKind; label: string; icon: 'wallet' | 'person' | 'tabTransactions' }[] = [
  { kind: 'direct', label: 'Quỹ chi trực tiếp', icon: 'wallet' },
  { kind: 'personal', label: 'Cá nhân ứng chi', icon: 'person' },
  { kind: 'advance', label: 'Giao cá nhân chi', icon: 'tabTransactions' },
];

/** Cách giao tiền ứng khi chọn "Giao cá nhân chi" mà đang có người giữ tiền giao chưa chi hết: giao thêm cho người (mới) hoặc ghi chi từ khoản đã giao. */
export type AdvanceMode = 'give' | 'spend';

/**
 * Trường "Hình thức chi" của form chi quỹ (chỉ khi THÊM MỚI; đúng ba lựa chọn, không bị khoá theo số dư quỹ). Chọn "Cá nhân ứng chi" thì NGAY TRONG ô này danh sách người xổ ra (mục cuối
 * "Thành viên khác" để nhập tên). Chọn "Giao cá nhân chi": chưa có khoản giao nào hoặc các khoản giao đã chi hết → xổ thẳng danh sách người nhận tiền ứng; còn người đang giữ tiền giao chưa chi hết →
 * hỏi trước "Quỹ giao cá nhân" (danh sách thành viên như thường) hay "Chi từ khoản đã giao" (chỉ những người đang giữ tiền giao chưa chi hết). Chọn xong ô quay lại hiện hình thức kèm tên người.
 */
function KindFields({
  kind,
  person,
  members,
  heldPersons,
  advanceMode,
  onKind,
  onAdvanceMode,
  onPerson,
}: {
  kind: ExpenseKind;
  person: string;
  members: readonly string[];
  /** Những người đang giữ tiền quỹ giao mà chưa chi hết. */
  heldPersons: readonly string[];
  advanceMode: AdvanceMode | null;
  onKind: (kind: ExpenseKind) => void;
  onAdvanceMode: (mode: AdvanceMode | null) => void;
  onPerson: (name: string) => void;
}) {
  const colors = useColors();
  /** 'sub': đang chọn cách giao; 'person': đang chọn người; 'idle': ô hình thức thu gọn. */
  const [step, setStep] = useState<'idle' | 'sub' | 'person'>('idle');
  /** Vừa bấm "Đổi hình thức chi": ô hình thức hiện lại với danh sách đã xổ sẵn. */
  const [reopen, setReopen] = useState(false);
  const hasHeld = heldPersons.length > 0;
  const spending = kind === 'advance' && advanceMode === 'spend';
  const names = spending ? heldPersons : members;
  const typed = !!person && !names.includes(person);
  const iconBadge = (name: 'wallet' | 'person' | 'tabTransactions') => (
    <View style={[styles.fundBadge, { backgroundColor: colors.primarySoft }]}>
      <SvgIcon name={name} size={16} color={colors.primary} strokeWidth={2} />
    </View>
  );
  const pill = (label: string, icon: ReactNode, onPress: () => void) => (
    <View style={styles.kindLinks}>
      <Pressable accessibilityRole="button" hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.kindPill, { backgroundColor: colors.primarySoft, borderColor: colors.primary }, pressStyle(pressed)]}>
        {icon}
        <AppText weight="semibold" color={colors.primary} style={styles.kindLink}>
          {label}
        </AppText>
      </Pressable>
    </View>
  );
  const backIcon = (
    <View style={{ transform: [{ rotate: '180deg' }] }}>
      <SvgIcon name="chevronRight" size={14} color={colors.primary} strokeWidth={2.4} />
    </View>
  );
  const goBack = () => {
    setStep('idle');
    if (!typed) setReopen(true);
  };

  if (step === 'sub' && kind === 'advance') {
    return (
      <View style={formStyles.field}>
        <FormLabel>Giao cá nhân chi</FormLabel>
        <InlineSelect
          initiallyOpen
          accessibilityLabel="Cách giao cá nhân chi"
          selectedKey={advanceMode ?? ''}
          placeholder="Chọn cách giao"
          placeholderIcon={iconBadge('tabTransactions')}
          onSelect={(key) => {
            onAdvanceMode(key as AdvanceMode);
            onPerson('');
            setStep('person');
          }}
          options={[
            { key: 'give', name: 'Quỹ giao cá nhân', icon: iconBadge('tabTransactions') },
            { key: 'spend', name: 'Chi từ khoản đã giao', icon: iconBadge('wallet') },
          ]}
        />
        {pill('Đổi hình thức chi', backIcon, goBack)}
      </View>
    );
  }

  if (step === 'person' && kind !== 'direct') {
    const label = kind === 'personal' ? 'Người chi' : spending ? 'Người đang giữ tiền giao' : 'Người nhận tiền ứng';
    return (
      <View style={formStyles.field}>
        <FormLabel>{label}</FormLabel>
        <PersonSelect
          initiallyOpen
          allowOther={!spending}
          members={names}
          value={person}
          accessibilityLabel={label}
          onChange={(name) => {
            onPerson(name);
            if (name && names.includes(name)) setStep('idle');
          }}
        />
        {pill(typed ? 'Xong' : 'Đổi hình thức chi', typed ? <SvgIcon name="check" size={14} color={colors.primary} strokeWidth={2.4} /> : backIcon, goBack)}
      </View>
    );
  }

  const selectedName = (option: (typeof KIND_OPTIONS)[number]) => {
    if (option.kind !== kind || option.kind === 'direct' || !person) return option.label;
    return spending ? `Chi từ khoản đã giao · ${person}` : `${option.label} · ${person}`;
  };
  return (
    <View style={formStyles.field}>
      <FormLabel>Hình thức chi</FormLabel>
      <InlineSelect
        key={reopen ? 'reopen' : 'closed'}
        initiallyOpen={reopen}
        accessibilityLabel="Hình thức chi"
        selectedKey={kind}
        onSelect={(key) => {
          const next = key as ExpenseKind;
          onKind(next);
          setReopen(false);
          if (next === 'direct') setStep('idle');
          else if (next === 'advance' && hasHeld) {
            onAdvanceMode(null);
            setStep('sub');
          } else {
            onAdvanceMode(next === 'advance' ? 'give' : null);
            setStep('person');
          }
        }}
        options={KIND_OPTIONS.map((option) => ({ key: option.kind as string, name: selectedName(option), icon: iconBadge(option.icon) }))}
      />
      {kind === 'advance' && hasHeld
        ? pill('Đổi cách giao / người', <SvgIcon name="person" size={14} color={colors.primary} strokeWidth={2.2} />, () => {
            setReopen(false);
            setStep('sub');
          })
        : kind !== 'direct' &&
          pill(person ? 'Đổi người' : kind === 'personal' ? 'Chọn người chi' : 'Chọn người nhận tiền ứng', <SvgIcon name="person" size={14} color={colors.primary} strokeWidth={2.2} />, () => {
            setReopen(false);
            setStep('person');
          })}
    </View>
  );
}

/** Form chi quỹ: hình thức chi, số tiền (ĐỒNG, nhập thẳng), nội dung, ngày. Không chặn theo số dư quỹ: số dư có thể âm. */
export function FundExpenseForm({
  fund,
  existing,
  existingAdvance,
  onChanged,
  onAdded,
  variant = 'compact',
  funds = [],
  onPickFund,
  showTitle = true,
  members,
  heldPersons = [],
  planSpend,
}: Props) {
  const colors = useColors();
  const toast = useToast();
  const today = todayStr();
  /** Bản nháp từ "Chụp nhanh" (chỉ khi thêm mới). */
  const [quick] = useState(() => (existing || existingAdvance ? null : peekQuickDraft()));
  useEffect(() => clearQuickDraft(), []);
  const [amount, setAmount] = useState(existing?.amount ?? existingAdvance?.amount ?? quick?.amount ?? 0);
  const [title, setTitle] = useState(existing?.title ?? existingAdvance?.title ?? quick?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? existingAdvance?.date ?? today);
  const [error, setError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Mã các ảnh đính kèm (hóa đơn…); lưu cùng khoản chi quỹ. */
  const [photos, setPhotos] = useState<string[]>(existing?.ph ? [...existing.ph] : (quick?.ph ?? []));
  // Hình thức do người dùng tự chọn; mặc định là quỹ chi trực tiếp (không đổi theo số dư quỹ).
  const [pickedKind, setPickedKind] = useState<ExpenseKind | null>(null);
  /** "Giao cá nhân chi": giao tiền cho người (give) hay ghi chi từ khoản đã giao (spend); null = chưa chọn / không có lựa chọn. */
  const [advanceMode, setAdvanceMode] = useState<AdvanceMode | null>(null);
  /** Đổi hình thức chi: xoá lỗi của hình thức cũ. */
  function pickKind(next: ExpenseKind) {
    setPickedKind(next);
    setAdvanceMode(null);
    setPerson('');
    setError('');
  }
  const kind: ExpenseKind = pickedKind ?? 'direct';
  const [person, setPerson] = useState(existingAdvance?.person ?? '');
  // Mã bản ghi sinh MỘT LẦN cho mỗi lần nhập: bấm lưu nhiều lần hoặc thử lại sau lỗi không tạo bản ghi trùng.
  const [clientId, setClientId] = useState(() => newExpenseId(Date.now()));
  const adding = !existing && !existingAdvance;
  /** Ghi chi từ khoản đã giao của một người (không tạo lần giao mới). */
  const spendFromAdvance = adding && kind === 'advance' && advanceMode === 'spend';
  const givingAdvance = existingAdvance ? true : adding && kind === 'advance' && !spendFromAdvance;
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
    // Chi từ khoản đã giao: ghi như khoản chi từ tiền ứng của người đó (chia vào các lần giao cũ nhất trước; phần vượt dồn vào lần giao mới nhất).
    if (spendFromAdvance) {
      const spendProblem = !person ? 'Chọn người đang giữ tiền giao.' : validateFundExpense({ title, date, fundId: fund.id, amount });
      if (spendProblem) {
        setError(spendProblem);
        return;
      }
      setBusy(true);
      try {
        const parts = planSpend?.(person, amount) ?? [];
        if (parts.length === 0) {
          setError('Người này chưa có khoản giao tiền ứng.');
          return;
        }
        for (const [index, part] of parts.entries()) {
          await saveFundExpenseSynced({
            clientId: `${clientId}-${index}`,
            fundId: part.fundId,
            title: title.trim(),
            date,
            amount: part.amount,
            mode: 'advance',
            advanceId: part.advanceId,
            ...(index === 0 ? { ph: photos } : {}),
          });
        }
        toast.show('Đã ghi khoản chi');
        setAmount(0);
        setTitle('');
        setPhotos([]);
        setDate(todayStr());
        setError('');
        setPickedKind(null);
        setAdvanceMode(null);
        setPerson('');
        setClientId(newExpenseId(Date.now()));
        onAdded?.();
      } catch (e) {
        setError(e instanceof FundInputError ? e.message : describeFundError(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    const who = person;
    const mode: ExpenseKind = existingAdvance ? 'advance' : adding ? kind : 'direct';
    // Mọi hình thức đều phải có số tiền khác 0 (giao tiền ứng mới 0 đồng sẽ trùng với "cá nhân ứng chi trước").
    const problem =
      mode === 'advance'
        ? !who
          ? 'Chọn người nhận tiền ứng.'
          : !date
            ? 'Chọn ngày giao.'
            : amount < 0 || (adding && amount === 0)
              ? amount < 0
                ? 'Số tiền giao không hợp lệ.'
                : 'Nhập số tiền lớn hơn 0.'
              : null
        : mode === 'personal' && !who
          ? 'Chọn người chi.'
          : validateFundExpense({ title, date, fundId: fund.id, amount });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      if (existingAdvance) {
        const ok = await updateAdvanceSynced(existingAdvance.id, { title: title.trim(), date, amount });
        if (!ok.value) {
          setError('Không tìm thấy khoản giao tiền ứng này. Có thể nó đã bị xoá.');
          return;
        }
        toast.show('Đã lưu thay đổi');
      } else if (mode === 'advance') {
        await createAdvanceSynced({ clientId, fundId: fund.id, person: who, title: title.trim(), date, amount });
        toast.show('Đã ghi nhận giao tiền ứng');
      } else {
        const result = await saveFundExpenseSynced({
          id: existing?.id,
          clientId: existing ? undefined : clientId,
          fundId: fund.id,
          title: title.trim(),
          date,
          amount,
          ph: photos,
          ...(mode === 'personal' ? { mode: 'personal' as const, payer: who } : {}),
        });
        if (result.value === null) {
          setError('Không tìm thấy khoản chi này. Có thể nó đã bị xoá.');
          return;
        }
        toast.show(fundExpenseSavedMessage(!!existing, false));
      }
      if (!existing) {
        setAmount(0);
        setTitle('');
        setDate(todayStr());
        setError('');
        setPickedKind(null);
        setAdvanceMode(null);
        setPerson('');
        setPhotos([]);
        setClientId(newExpenseId(Date.now()));
      }
      if (existing || existingAdvance) onChanged();
      else onAdded?.();
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
            {existingAdvance ? 'Sửa giao tiền ứng' : existing ? 'Sửa chi tiêu quỹ' : 'Chi tiêu quỹ'}
          </AppText>
        )}

        {adding && (
          <KindFields
          kind={kind}
          person={person}
          members={members ?? []}
          heldPersons={heldPersons}
          advanceMode={advanceMode}
          onKind={pickKind}
          onAdvanceMode={setAdvanceMode}
          onPerson={(name) => {
            setPerson(name);
            setError('');
          }}
        />
        )}

        <AmountField
          label={givingAdvance ? 'Số tiền giao' : 'Số tiền'}
          value={amount}
          onChange={(value) => {
            setAmount(value);
            setError('');
          }}
        />

        {/* Giao tiền ứng không cần nội dung: chỉ chọn người nhận, số tiền và ngày. */}
        {!givingAdvance && (
          <View style={formStyles.field}>
            <FormLabel>Nội dung</FormLabel>
            <TextInput
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                setError('');
              }}
              maxLength={FUND_TITLE_MAX}
              placeholder="Ví dụ: Mua nước, thuê sân"
              placeholderTextColor={colors.muted}
              style={[formStyles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
            />
          </View>
        )}

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

        {!givingAdvance && <PhotoField value={photos} onChange={setPhotos} />}
        {!!error && (
          <AppText color={colors.danger} style={formStyles.error} accessibilityRole="alert">
            {error}
          </AppText>
        )}

        <View style={formStyles.actions}>
          <FormSaveButton label={givingAdvance ? 'Lưu khoản giao tiền' : 'Lưu khoản chi'} busy={busy} onPress={() => void save()} />
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
                    style={[styles.fundItem, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? colors.primarySoft : colors.bg }]}
                  >
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
      {showTitle && (
        <AppText weight="bold" style={styles.heading}>
          {existingAdvance ? 'Sửa giao tiền ứng' : existing ? 'Sửa chi tiêu quỹ' : 'Chi tiêu quỹ'}
        </AppText>
      )}
      {adding && (
        <KindFields
          kind={kind}
          person={person}
          members={members ?? []}
          heldPersons={heldPersons}
          advanceMode={advanceMode}
          onKind={pickKind}
          onAdvanceMode={setAdvanceMode}
          onPerson={(name) => {
            setPerson(name);
            setError('');
          }}
        />
      )}
      <View>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          {givingAdvance ? 'Số tiền giao' : 'Số tiền'}
        </AppText>
        <AmountInput
          value={amount}
          onChangeValue={(next) => {
            setAmount(next);
            setError('');
          }}
        />
      </View>
      {!givingAdvance && (
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
      )}
      <View>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Ngày
        </AppText>
        <DateField value={date} onPress={() => setCalendarOpen(true)} />
      </View>

      {!givingAdvance && <PhotoField value={photos} onChange={setPhotos} />}
      {!!error && (
        <AppText color={colors.danger} style={styles.error} accessibilityRole="alert">
          {error}
        </AppText>
      )}

      <View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void save()}
          style={[styles.primary, { backgroundColor: colors.primary, borderColor: colors.primary }]}
        >
          <AppText weight="semibold" color={colors.primaryInk} style={styles.primaryText}>
            {givingAdvance ? 'Lưu khoản giao tiền' : 'Lưu khoản chi'}
          </AppText>
        </Pressable>
      </View>

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
  /** Ô nhập tên (sau "Thành viên khác"): cùng dáng hàng chọn người, có biểu tượng bên trái và nút quay lại danh sách bên phải. */
  kindLinks: { alignItems: 'flex-end', marginTop: 8 },
  kindLink: { fontSize: 13.5 },
  kindPill: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
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
  hint: { fontSize: 12.5, lineHeight: 17 },
  primary: { minHeight: 46, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16 },
  delete: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
