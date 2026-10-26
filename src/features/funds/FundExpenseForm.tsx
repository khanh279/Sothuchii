import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { AppTextInput as TextInput } from '@/components/app-text-input';

import { AmountInput } from '@/components/amount-input';
import { ConfirmDialog } from '@/components/design';
import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { AmountField, FormLabel, PickButton, PickPanel, formStyles } from '@/components/expense-form-parts';
import { InlineSelect } from '@/components/inline-select';
import { KeyboardAnchor } from '@/components/keyboard-aware-scroll';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { createAdvanceSynced, saveFundExpenseSynced, updateAdvanceSynced } from '@/data/fundService';
import { AppRadius } from '@/constants/palette';
import { FUND_TITLE_MAX, fundExpenseSavedMessage, overspends, validateFundExpense } from '@/domain/fundForms';
import { newExpenseId } from '@/domain/expenses';
import { FUND_INSUFFICIENT_MESSAGE, defaultExpenseKind, directSpendAvailable, splitByCash, type ExpenseKind, type SpendSplit } from '@/domain/fundAdvance';
import { formatVnd } from '@/utils/format';
import { describeFundError } from '@/features/funds/hooks';
import { PersonSelect } from '@/features/funds/PersonSelect';
import { ShortfallDialog } from '@/features/funds/ShortfallDialog';
import { PersonPicker } from '@/features/people/PersonPicker';
import { useColors } from '@/hooks/use-colors';
import type { Advance, Fund, FundExpense } from '@/types/fund';
import type { Vnd } from '@/types/money';
import { todayStr } from '@/utils/date';

interface Props {
  fund: Fund;
  /** Số dư của quỹ TRƯỚC khi lưu (để cảnh báo vượt quỹ). */
  balance: Vnd;
  /**
   * Tiền thực tế đang có trong quỹ (`fundCash`): căn cứ để chặn chi trực tiếp / giao tiền ứng vượt số dư và để chọn hình thức mặc định
   * (quỹ hết tiền → "Cá nhân ứng chi"). Bỏ trống = dùng `balance`. Lúc bấm lưu, tầng lưu trữ kiểm tra lại với số dư mới nhất.
   */
  cash?: Vnd;
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
  /** Những người đang giữ tiền ứng của quỹ: mỗi người thêm một lựa chọn "Quỹ giao tiền A chi" ở Hình thức chi (khoản chi tính vào tiền A ứng trước; nhiều lần giao gộp chung, chi vào lần cũ nhất trước). */
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
  { kind: 'personal', label: 'Cá nhân ứng tiền chi trước', icon: 'person' },
  { kind: 'advance', label: 'Quỹ giao tiền ứng trước', icon: 'tabTransactions' },
];

/**
 * Hai trường bổ sung của form chi quỹ (chỉ khi THÊM MỚI): "Hình thức chi" và, với hai hình thức liên quan đến cá nhân, "Người chi" /
 * "Người nhận ứng" (chọn từ danh sách người có sẵn, như khi đóng quỹ). Hình thức trực tiếp không hiện thêm trường nào.
 */
function KindFields({
  kind,
  locked,
  person,
  members,
  spendKey,
  spendOptions,
  onKind,
  onSpend,
  onPerson,
  onPersonPick,
}: {
  kind: ExpenseKind;
  /** true: ô Hình thức chi chỉ hiển thị, không mở ra để chọn (quỹ hết tiền). */
  locked?: boolean;
  person: string;
  members?: readonly string[];
  /** Hồ sơ ứng trước đang chọn cho "Quỹ giao tiền A chi" (null = không chọn). */
  spendKey: string | null;
  spendOptions: readonly { key: string; name: string }[];
  onKind: (kind: ExpenseKind) => void;
  onSpend: (advanceId: string) => void;
  onPerson: () => void;
  onPersonPick: (name: string) => void;
}) {
  const colors = useColors();
  /** Biểu tượng riêng của "Quỹ giao tiền A chi" (hoá đơn), khác biểu tượng người của "Cá nhân ứng chi trước". */
  const receiptBadge = (
    <View style={[styles.fundBadge, { backgroundColor: colors.primarySoft }]}>
      <SvgIcon name="receipt" size={16} color={colors.primary} strokeWidth={2} />
    </View>
  );
  return (
    <>
      <View style={formStyles.field}>
        <FormLabel>Hình thức chi</FormLabel>
        <InlineSelect
          accessibilityLabel="Hình thức chi"
          disabled={locked}
          selectedKey={spendKey ? `spend:${spendKey}` : kind}
          onSelect={(key) => (key.startsWith('spend:') ? onSpend(key.slice('spend:'.length)) : onKind(key as ExpenseKind))}
          options={[
            ...KIND_OPTIONS.map((option) => ({
              key: option.kind as string,
              name: option.label,
              icon: (
                <View style={[styles.fundBadge, { backgroundColor: colors.primarySoft }]}>
                  <SvgIcon name={option.icon} size={16} color={colors.primary} strokeWidth={2} />
                </View>
              ),
            })),
            ...spendOptions.map((option) => ({ key: `spend:${option.key}`, name: option.name, icon: receiptBadge })),
          ]}
        />
        {/* Quỹ hết tiền: dòng cảnh báo đỏ nhỏ, đủ MỘT hàng, ngay dưới ô Hình thức chi (ô đang bị khoá ở "Cá nhân ứng chi"). */}
        {locked && (
          <AppText color={colors.danger} style={styles.noCash} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="alert">
            {NO_CASH_LINE}
          </AppText>
        )}
      </View>
      {kind !== 'direct' && !spendKey && (
        <View style={formStyles.field}>
          <FormLabel>{kind === 'personal' ? 'Người chi' : 'Người nhận tiền ứng'}</FormLabel>
          {members ? (
            <PersonSelect members={members} value={person} onChange={onPersonPick} accessibilityLabel={kind === 'personal' ? 'Người chi' : 'Người nhận tiền ứng'} />
          ) : (
            <Pressable
              style={[formStyles.pickCurrent, { backgroundColor: colors.bg, borderColor: colors.line }]}
              onPress={onPerson}
              accessibilityRole="button"
              accessibilityLabel={`${kind === 'personal' ? 'Người chi' : 'Người nhận tiền ứng'}: ${person || 'chưa chọn'}`}
            >
              <View style={[styles.fundBadge, { backgroundColor: colors.primarySoft }]}>
                <SvgIcon name="person" size={16} color={colors.primary} strokeWidth={2} />
              </View>
              <AppText weight="semibold" color={person ? colors.ink : colors.muted} style={formStyles.pickName} numberOfLines={1}>
                {person || 'Chọn người'}
              </AppText>
              <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      )}
    </>
  );
}

/** Dòng cảnh báo một hàng dưới ô Hình thức chi khi quỹ hết tiền. */
const NO_CASH_LINE = 'Số dư quỹ là 0 đ. Khoản chi sẽ do cá nhân ứng tiền chi trước';

/** Form chi quỹ: hình thức chi, số tiền (ĐỒNG, nhập thẳng), nội dung, ngày. Chi vượt số dư vẫn lưu nhưng có cảnh báo. */
export function FundExpenseForm({
  fund,
  balance,
  cash = balance,
  existing,
  existingAdvance,
  onChanged,
  onAdded,
  variant = 'compact',
  funds = [],
  onPickFund,
  showTitle = true,
  members,
  heldPersons,
  planSpend,
}: Props) {
  const colors = useColors();
  const toast = useToast();
  const today = todayStr();
  const [amount, setAmount] = useState(existing?.amount ?? existingAdvance?.amount ?? 0);
  const [title, setTitle] = useState(existing?.title ?? existingAdvance?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? existingAdvance?.date ?? today);
  const [error, setError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Hình thức do người dùng tự chọn; chưa chọn thì theo số dư quỹ hiện tại (hết tiền → cá nhân ứng chi, còn tiền → chi trực tiếp). Không tự đổi sau khi đã chọn.
  const [pickedKind, setPickedKind] = useState<ExpenseKind | null>(null);
  /** Đã chọn "Quỹ giao tiền A chi": tên người A mà khoản chi này tính vào tiền ứng của họ. */
  const [advanceSpendId, setAdvanceSpendId] = useState<string | null>(null);
  const spendOptions = (heldPersons ?? []).map((name) => ({ key: name, name: `Quỹ giao tiền ${name} chi` }));
  function pickSpend(spendPerson: string) {
    setAdvanceSpendId(spendPerson);
    setPickedKind('direct');
    setSplitIntent(false);
    setShortfall(false);
    setError('');
  }
  /** Đổi hình thức chi: xoá các ý định / cảnh báo của hình thức cũ. */
  function pickKind(next: ExpenseKind) {
    setAdvanceSpendId(null);
    setPickedKind(next);
    setSplitIntent(false);
    setShortfall(false);
    setError('');
  }
  /** Quỹ hết tiền (số dư ≤ 0) khi THÊM MỚI: chỉ có "Cá nhân ứng chi", ô Hình thức chi bị khoá, không mở ra để chọn hình thức khác. */
  const lockKind = !existing && !existingAdvance && cash <= 0;
  const kind: ExpenseKind = lockKind ? 'personal' : (pickedKind ?? defaultExpenseKind(cash));
  /** Vừa bị chặn vì số dư không đủ: hiện hai hình thức còn lại để người dùng tự chọn. */
  /** Thẻ thông báo nổi "Không đủ số dư quỹ" (hiện khi bấm ghi chi tiêu trực tiếp vượt số dư). */
  const [shortfall, setShortfall] = useState(false);
  /** Sau khi chọn "Cá nhân ứng chi" ở thẻ thông báo: chọn người chi xong thì đi tiếp sang bước xác nhận ghi nhận. */
  const [continueAfterPerson, setContinueAfterPerson] = useState(false);
  /** Người dùng đã chọn "Cá nhân ứng chi" từ gợi ý khi quỹ không đủ: khi lưu sẽ chia nguồn tiền (quỹ chi phần có sẵn, cá nhân ứng phần còn thiếu) sau khi xác nhận. */
  const [splitIntent, setSplitIntent] = useState(false);
  const [pendingSplit, setPendingSplit] = useState<SpendSplit | null>(null);
  const [person, setPerson] = useState(existingAdvance?.person ?? '');
  const [personOpen, setPersonOpen] = useState(false);
  // Mã bản ghi sinh MỘT LẦN cho mỗi lần nhập: bấm lưu nhiều lần hoặc thử lại sau lỗi không tạo bản ghi trùng.
  const [clientId, setClientId] = useState(() => newExpenseId(Date.now()));
  const adding = !existing && !existingAdvance;
  /** Số tối đa có thể giao ứng lúc này (đang sửa hồ sơ thì tính lại cả số đã giao). */
  const giveMax = Math.max(0, cash + (existingAdvance?.amount ?? 0));
  const givingAdvance = existingAdvance ? true : adding && kind === 'advance';
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

  async function save(confirmed = false, forced?: { person: string }) {
    if (busy) return;
    // "Quỹ giao tiền A chi": ghi như khoản chi từ tiền ứng của A (tính vào khoản A ứng trước, không trừ tiền quỹ thêm lần nữa).
    if (advanceSpendId && adding) {
      const spendProblem = validateFundExpense({ title, date, fundId: fund.id, amount });
      if (spendProblem) {
        setError(spendProblem);
        return;
      }
      setBusy(true);
      try {
        const parts = planSpend?.(advanceSpendId, amount) ?? [];
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
          });
        }
        toast.show('Đã ghi khoản chi');
        setAmount(0);
        setTitle('');
        setDate(todayStr());
        setError('');
        setAdvanceSpendId(null);
        setClientId(newExpenseId(Date.now()));
        onAdded?.();
      } catch (e) {
        setError(e instanceof FundInputError ? e.message : describeFundError(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    // `forced`: vừa chọn "Cá nhân ứng chi" + người chi từ thẻ thông báo (state chưa kịp cập nhật nên truyền trực tiếp).
    const who = forced ? forced.person : person;
    const mode: ExpenseKind = forced ? 'personal' : existingAdvance ? 'advance' : adding ? kind : 'direct';
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
    // Kiểm tra số dư trước khi gửi (tầng lưu trữ kiểm tra lại lần nữa với số dư mới nhất, nên số dư đổi sau khi mở form vẫn không lọt).
    if (mode === 'advance' && amount > giveMax && amount > (existingAdvance?.amount ?? 0)) {
      setError('Số tiền giao vượt quá số dư quỹ');
      return;
    }
    if (mode === 'direct' && !existing?.mode) {
      const previous = existing ? existing.amount : 0;
      if (amount > directSpendAvailable(cash, previous) && amount > previous) {
        // Thêm mới: thẻ thông báo nổi kèm lối chọn Cá nhân ứng chi; đang sửa thì chỉ báo lỗi.
        if (adding) setShortfall(true);
        else setError(FUND_INSUFFICIENT_MESSAGE);
        return;
      }
    }
    const plan = mode === 'personal' && adding && (splitIntent || !!forced) ? splitByCash(cash, amount) : null;
    // Đi từ thẻ thông báo "Không đủ số dư quỹ": luôn xem lại phân bổ (kể cả khi quỹ hết tiền, cá nhân ứng toàn bộ) rồi mới ghi.
    if ((plan || forced) && !confirmed) {
      setPendingSplit(plan ?? { fundPart: 0, personalPart: amount });
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
          ...(mode === 'personal' ? { mode: 'personal' as const, payer: who } : {}),
          ...(plan ? { fundPart: plan.fundPart } : {}),
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
        setPickedKind(null);
        setShortfall(false);
        setSplitIntent(false);
        setPerson('');
        setClientId(newExpenseId(Date.now()));
      }
      if (existing || existingAdvance) onChanged();
      else onAdded?.();
    } catch (e) {
      const message = e instanceof FundInputError ? e.message : describeFundError(e);
      // Số dư vừa đổi sau khi mở form: cũng dùng thẻ thông báo nổi thay vì dòng lỗi.
      if (adding && message === FUND_INSUFFICIENT_MESSAGE) setShortfall(true);
      else setError(message);
    } finally {
      setBusy(false);
      setPendingSplit(null);
    }
  }

  // Chi vượt số dư (thêm mới): hộp thoại cho thấy số dư / khoản chi / còn thiếu và chọn NGƯỜI CHI; Xác nhận ghi ngay (quỹ chi phần đang có, người chi ứng phần còn thiếu).
  const shortfallDialog = shortfall && (
    <ShortfallDialog
      cash={cash}
      amount={amount}
      members={members ?? []}
      busy={busy}
      onClose={() => setShortfall(false)}
      onConfirm={(name) => {
        setShortfall(false);
        setPerson(name);
        void save(true, { person: name });
      }}
    />
  );

  const splitDialog = pendingSplit && (
    <ConfirmDialog
      title="Xác nhận chi quỹ"
      message={`${title.trim() || 'Khoản chi'} · ${formatVnd(amount)}`}
      note={
        pendingSplit.fundPart > 0
          ? `Quỹ chi: ${formatVnd(pendingSplit.fundPart)}\nCá nhân ứng${person ? ` (${person})` : ''}: ${formatVnd(pendingSplit.personalPart)}\nTiền thực tế trong quỹ chỉ giảm ${formatVnd(pendingSplit.fundPart)}; phần cá nhân ứng được quỹ ghi nợ.`
          : `Cá nhân ứng${person ? ` (${person})` : ''}: ${formatVnd(pendingSplit.personalPart)}\nQuỹ không chi khoản này; phần cá nhân ứng được quỹ ghi nợ.`
      }
      busy={busy}
      onCancel={() => setPendingSplit(null)}
      onConfirm={() => void save(true)}
    />
  );

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
            locked={lockKind}
            person={person}
            members={members}
            spendKey={advanceSpendId}
            spendOptions={spendOptions}
            onKind={pickKind}
            onSpend={pickSpend}
            onPerson={() => setPersonOpen(true)}
            onPersonPick={(name) => {
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

        {givingAdvance && (
          <AppText color={colors.muted} style={styles.hint}>
            Số tiền tối đa có thể giao: {formatVnd(giveMax)}
          </AppText>
        )}
        {!!error && (
          <AppText color={colors.danger} style={formStyles.error} accessibilityRole="alert">
            {error}
          </AppText>
        )}
        {shortfallDialog}
        {splitDialog}

        <KeyboardAnchor style={formStyles.actions}>
          <Pressable
            style={[formStyles.btn, formStyles.btnSave, { backgroundColor: colors.primary }, busy && formStyles.disabled]}
            onPress={() => void save()}
            disabled={busy}
            accessibilityRole="button"
          >
            <AppText weight="semibold" color={colors.primaryInk} style={formStyles.btnText}>
              {givingAdvance ? 'Lưu khoản giao tiền' : 'Lưu khoản chi'}
            </AppText>
          </Pressable>
        </KeyboardAnchor>

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
        {personOpen && (
          <PersonPicker
            title={kind === 'personal' ? 'Chọn người chi' : 'Chọn người nhận tiền ứng'}
            selected={person || null}
            names={members && members.length > 0 ? members : undefined}
            onClose={() => {
              setPersonOpen(false);
              setContinueAfterPerson(false);
            }}
            onPick={(name) => {
              setPerson(name);
              setError('');
              setPersonOpen(false);
              if (continueAfterPerson) {
                setContinueAfterPerson(false);
                void save(false, { person: name });
              }
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
          {existingAdvance ? 'Sửa giao tiền ứng' : existing ? 'Sửa chi tiêu quỹ' : 'Chi tiêu quỹ'}
        </AppText>
      )}
      {adding && (
        <KindFields
          kind={kind}
          locked={lockKind}
          person={person}
          members={members}
          spendKey={advanceSpendId}
          spendOptions={spendOptions}
          onKind={pickKind}
          onSpend={pickSpend}
          onPerson={() => setPersonOpen(true)}
          onPersonPick={(name) => {
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

      {givingAdvance && (
        <AppText color={colors.muted} style={styles.hint}>
          Số tiền tối đa có thể giao: {formatVnd(giveMax)}
        </AppText>
      )}
      {!!error && (
        <AppText color={colors.danger} style={styles.error} accessibilityRole="alert">
          {error}
        </AppText>
      )}
      {shortfallDialog}
      {splitDialog}

      <KeyboardAnchor>
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
      </KeyboardAnchor>

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
      {personOpen && (
        <PersonPicker
          title={kind === 'personal' ? 'Chọn người chi' : 'Chọn người nhận tiền ứng'}
          selected={person || null}
          names={members && members.length > 0 ? members : undefined}
          onClose={() => {
            setPersonOpen(false);
            setContinueAfterPerson(false);
          }}
          onPick={(name) => {
            setPerson(name);
            setError('');
            setPersonOpen(false);
            if (continueAfterPerson) {
              setContinueAfterPerson(false);
              void save(false, { person: name });
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  /** Ô nhập tên (sau "Thành viên khác"): cùng dáng hàng chọn người, có biểu tượng bên trái và nút quay lại danh sách bên phải. */
  noCash: { fontSize: 12, lineHeight: 16 },
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
