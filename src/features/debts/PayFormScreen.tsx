import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppTextInput as TextInput } from '@/components/app-text-input';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AmountField, FormLabel, formStyles } from '@/components/expense-form-parts';
import { InlineSelect } from '@/components/inline-select';
import { KeyboardAnchor, KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { PhotoField } from '@/features/photos/PhotoViews';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { PayInputError } from '@/data/payRepository';
import { addTransferSynced, updatePayGroupSynced, updateTransferSynced } from '@/data/payService';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { formatVndInput, parseVndInput } from '@/domain/money';
import {
  canRecordPay,
  formFromPay,
  parsePayAmount,
  payKindFor,
  payNameOptions,
  whoOptions,
  type PayFormState,
  type PayType,
} from '@/domain/payForm';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';
import { todayStr } from '@/utils/date';

interface Props {
  /** Có = đang SỬA các khoản này (nhiều mã = một nhóm trả bill hiển thị chung). */
  editIds?: readonly string[];
  /** Gọi sau khi sửa / xoá xong (màn sửa quay lại). */
  onFinished?: () => void;
}

/** Khoản "đại diện" của một nhóm: ngày / người / tổng tiền của cả nhóm (`Te`). */
function representative(pays: readonly Pay[], ids: readonly string[]): { form: PayFormState; original: { date: string; from: string; to: string; amt: number }; locked: boolean } | null {
  const found = ids.map((id) => pays.find((pay) => pay.id === id)).filter((pay): pay is Pay => !!pay);
  if (!found.length) return null;
  const first = found[0];
  const amt = found.length > 1 ? Math.round(found.reduce((sum, pay) => sum + (+pay.amt || 0), 0)) : first.amt;
  const form = formFromPay(found.length > 1 ? { ...first, kind: 'bill', amt } : first);
  return { form, original: { date: first.date, from: first.from, to: first.to, amt }, locked: found.length > 1 };
}

/**
 * Form ghi nhận / sửa / xoá một khoản chuyển tiền hoặc trả bill (`#pay-form` của PWA): ngày, nội dung, người trả → người
 * nhận, loại (Trả bill / Chuyển tiền) và số tiền (đồng). Sửa (mở bằng vuốt dòng ở lịch sử): chỉ có nút "Lưu thay đổi"; xóa bằng vuốt dòng.
 */
export default function PayFormScreen({ editIds, onFinished }: Props) {
  const colors = useColors();
  const { bills, pays, people, loaded, error, reload } = useDebtData();
  const editing = !!editIds?.length;
  const source = useMemo(() => (editIds ? representative(pays, editIds) : null), [editIds, pays]);

  if (error) {
    return (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          {error}
        </AppText>
      </View>
    );
  }
  if (!loaded) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  if (editing && !source) {
    return (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          Không tìm thấy khoản này. Có thể nó đã bị xoá.
        </AppText>
      </View>
    );
  }
  // `key` theo khoản đang sửa: đổi khoản thì dựng lại form với giá trị ban đầu mới.
  return <PayForm key={editIds?.join(',') ?? 'new'} bills={bills} pays={pays} people={people} editIds={editIds} source={source} reload={reload} onFinished={onFinished} />;
}

interface FormProps {
  bills: Bill[];
  pays: Pay[];
  people: string[];
  editIds?: readonly string[];
  source: ReturnType<typeof representative>;
  reload: () => Promise<void>;
  onFinished?: () => void;
}

function PayForm({ bills, pays, people, editIds, source, reload, onFinished }: FormProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const today = todayStr();
  const editing = !!editIds?.length;
  const { ref: scrollRef, props: scrollProps } = useChromeScroll(!editing);

  const [date, setDate] = useState(source?.form.date ?? today);
  const [note, setNote] = useState(source?.form.note ?? '');
  /** Mã các ảnh đính kèm (biên lai chuyển khoản…); lưu cùng giao dịch. Khoản gộp nhiều khoản không có ảnh riêng. */
  const [photos, setPhotos] = useState<string[]>(() => (editIds?.length === 1 ? [...(pays.find((pay) => pay.id === editIds[0])?.ph ?? [])] : []));
  const [from, setFrom] = useState<string>(source?.form.from ?? BILL_OWNER_NAME);
  const [to, setTo] = useState(source?.form.to ?? '');
  const [amountText, setAmountText] = useState(source?.form.amountText ?? '');
  const [type, setType] = useState<PayType>(source?.form.type ?? 'vay');
  const [typeChosen, setTypeChosen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => payNameOptions(bills, pays, people), [bills, pays, people]);
  const toOptions = useMemo(() => whoOptions(options, from), [options, from]);
  // Như PWA: ô "đến" mặc định là người đầu tiên của danh sách và luôn khác ô "từ".
  const effectiveTo = toOptions.includes(to) ? to : editing ? to : (toOptions[0] ?? '');
  const amount = parsePayAmount(amountText);
  const canRecord = canRecordPay(effectiveTo, amount);

  async function save() {
    if (busy) return;
    if (!canRecord) {
      toast.show(effectiveTo ? 'Nhập số tiền lớn hơn 0.' : 'Chọn người nhận.');
      return;
    }
    setBusy(true);
    try {
      if (!editing) {
        await addTransferSynced({ date: date || today, note, from, to: effectiveTo, amt: amount, kind: payKindFor(type), ph: photos });
        toast.show('Đã ghi nhận');
        setAmountText('');
        setNote('');
        setPhotos([]);
        setTypeChosen(false);
        setType('vay');
        await reload();
        return;
      }
      if (source?.locked) {
        await updatePayGroupSynced(editIds ?? [], source.original, { date, note, from, to: effectiveTo, amt: amount });
      } else {
        const result = await updateTransferSynced(editIds?.[0] ?? '', { date, note, from, to: effectiveTo, amt: amount, kind: typeChosen ? payKindFor(type) : undefined, ph: photos });
        if (!result.value) {
          toast.show('Không tìm thấy khoản này. Có thể nó đã bị xoá.');
          return;
        }
      }
      toast.show('Đã ghi nhận');
      onFinished?.();
    } catch (e) {
      toast.show(e instanceof PayInputError ? e.message : describeDebtError(e));
    } finally {
      setBusy(false);
    }
  }

  const badge = (name: 'receipt' | 'tabTransactions' | 'person') => (
    <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
      <SvgIcon name={name} size={16} color={colors.primary} strokeWidth={2} />
    </View>
  );
  const typeOptions = [
    { key: 'bill', name: 'Trả bill', icon: badge('receipt') },
    { key: 'vay', name: 'Chuyển tiền', icon: badge('tabTransactions') },
  ];
  const personOptions = (names: readonly string[]) => names.map((name) => ({ key: name, name, icon: badge('person') }));

  return (
    <KeyboardAwareScrollView ref={scrollRef} {...scrollProps} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <View style={[formStyles.card, { backgroundColor: colors.surface }]}>
        <View style={formStyles.field}>
          <FormLabel>Hình thức</FormLabel>
          <InlineSelect
            accessibilityLabel="Hình thức"
            selectedKey={type}
            onSelect={(key) => {
              setType(key as PayType);
              setTypeChosen(true);
            }}
            options={typeOptions}
          />
        </View>

        <View style={styles.whoRow}>
          <View style={[formStyles.field, styles.whoCol]}>
            <FormLabel>Người gửi</FormLabel>
            <InlineSelect
              accessibilityLabel="Người gửi"
              selectedKey={from}
              onSelect={(name) => {
                setFrom(name);
                if (name === to) setTo('');
                if (!typeChosen && !editing) setType('vay'); // như PWA: đổi người thì loại về mặc định nếu chưa tự chọn
              }}
              options={personOptions(options)}
            />
          </View>
          {/* Mũi tên khối (thân chữ nhật + đầu tam giác, tô đặc) chỉ chiều chuyển tiền: từ người trả sang người nhận. */}
          <Svg width={22} height={22} viewBox="0 0 24 24" style={styles.arrow} accessibilityLabel="đưa tiền cho">
            <Path d="M2 9h11V4.5L22 12l-9 7.5V15H2z" fill={colors.muted} fillOpacity={0.6} />
          </Svg>
          <View style={[formStyles.field, styles.whoCol]}>
            <FormLabel>Người nhận</FormLabel>
            <InlineSelect
              accessibilityLabel="Người nhận"
              selectedKey={effectiveTo}
              placeholder="Chưa có người"
              placeholderIcon={badge('person')}
              onSelect={(name) => {
                setTo(name);
                if (!typeChosen && !editing) setType('vay');
              }}
              options={personOptions(toOptions)}
            />
          </View>
        </View>

        <AmountField label="Số tiền" value={parseVndInput(amountText)} onChange={(value) => setAmountText(formatVndInput(typeof value === 'function' ? value(parseVndInput(amountText)) : value))} />

        <View style={formStyles.field}>
          <FormLabel>Nội dung</FormLabel>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ví dụ: Trả tiền ăn, chuyển tiền nhà"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Nội dung"
            style={[formStyles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
          />
        </View>

        <View style={formStyles.field}>
          <FormLabel>Ngày</FormLabel>
          <DateField value={date} onPress={() => setCalendarOpen(true)} accessibilityLabel="Thời gian" />
        </View>

        {!source?.locked && <PhotoField value={photos} onChange={setPhotos} />}

        <KeyboardAnchor style={formStyles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void save()}
            style={[formStyles.btn, formStyles.btnSave, { backgroundColor: colors.primary }, busy && formStyles.disabled]}>
            <AppText weight="semibold" color={colors.primaryInk} style={formStyles.btnText}>
              {editing ? 'Lưu thay đổi' : 'Lưu giao dịch'}
            </AppText>
          </Pressable>
        </KeyboardAnchor>

        {calendarOpen && (
          <CalendarPanel
            variant="overlay"
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
    </KeyboardAwareScrollView>
  );
}

// Giao diện như form Chi tiêu quỹ: thẻ `formStyles.card`, nhãn trên ô, ô chọn (PickButton) cao 46 và bảng chọn phủ thẻ (PickPanel).
const styles = StyleSheet.create({
  content: { paddingHorizontal: 12, paddingTop: 4, gap: 12 },
  loading: { marginTop: 40 },
  notice: { marginHorizontal: 12, marginTop: 12, padding: 14, borderRadius: 14 },
  noticeText: { fontSize: 14, lineHeight: 20 },
  whoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  whoCol: { flex: 1, minWidth: 0 },
  arrow: { marginTop: 37 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
