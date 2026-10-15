import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { PayInputError } from '@/data/payRepository';
import { addTransferSynced, deletePaySynced, updatePayGroupSynced, updateTransferSynced } from '@/data/payService';
import { BILL_OWNER_NAME } from '@/domain/bills';
import {
  canRecordPay,
  formFromPay,
  maskPayAmount,
  parsePayAmount,
  payKindFor,
  payNameOptions,
  whoOptions,
  type PayFormState,
  type PayType,
} from '@/domain/payForm';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { OptionPicker } from '@/features/debts/OptionPicker';
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
  const amt = found.length > 1 ? Math.round(found.reduce((sum, pay) => sum + (+pay.amt || 0), 0) * 1e3) / 1e3 : first.amt;
  const form = formFromPay(found.length > 1 ? { ...first, kind: 'bill', amt } : first);
  return { form, original: { date: first.date, from: first.from, to: first.to, amt }, locked: found.length > 1 };
}

/**
 * Form ghi nhận / sửa / xoá một khoản chuyển tiền hoặc trả bill (`#pay-form` của PWA): ngày, nội dung, người trả → người
 * nhận, loại (Trả bill / Chuyển tiền) và số tiền (NGHÌN đồng). Sửa: "Lưu thay đổi", "Hủy sửa", "Xóa khoản này" (bấm hai lần).
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

  const [date, setDate] = useState(source?.form.date ?? today);
  const [note, setNote] = useState(source?.form.note ?? '');
  const [from, setFrom] = useState<string>(source?.form.from ?? BILL_OWNER_NAME);
  const [to, setTo] = useState(source?.form.to ?? '');
  const [amountText, setAmountText] = useState(source?.form.amountText ?? '');
  const [type, setType] = useState<PayType>(source?.form.type ?? 'vay');
  const [typeChosen, setTypeChosen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => payNameOptions(bills, pays, people), [bills, pays, people]);
  const toOptions = useMemo(() => whoOptions(options, from), [options, from]);
  // Như PWA: ô "đến" mặc định là người đầu tiên của danh sách và luôn khác ô "từ".
  const effectiveTo = toOptions.includes(to) ? to : editing ? to : (toOptions[0] ?? '');
  const amount = parsePayAmount(amountText);
  const canRecord = canRecordPay(effectiveTo, amount);

  async function save() {
    if (busy || !canRecord) return;
    setBusy(true);
    try {
      if (!editing) {
        await addTransferSynced({ date: date || today, note, from, to: effectiveTo, amt: amount, kind: payKindFor(type) });
        toast.show('Đã ghi nhận');
        setAmountText('');
        setNote('');
        setTypeChosen(false);
        setType('vay');
        await reload();
        return;
      }
      if (source?.locked) {
        await updatePayGroupSynced(editIds ?? [], source.original, { date, note, from, to: effectiveTo, amt: amount });
      } else {
        const result = await updateTransferSynced(editIds?.[0] ?? '', { date, note, from, to: effectiveTo, amt: amount, kind: typeChosen ? payKindFor(type) : undefined });
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

  async function remove() {
    if (busy || !editing) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setTimeout(() => setDeleteArmed(false), 3500);
      return;
    }
    setBusy(true);
    try {
      await deletePaySynced(editIds ?? []);
      toast.show('Đã xóa');
      onFinished?.();
    } catch (e) {
      toast.show(describeDebtError(e));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }];

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.row}>
          <View style={styles.dateBox}>
            <DateField value={date} onPress={() => setCalendarOpen(true)} accessibilityLabel="Thời gian" />
          </View>
          <TextInput value={note} onChangeText={setNote} placeholder="Nội dung" placeholderTextColor={colors.muted} accessibilityLabel="Nội dung" style={[inputStyle, styles.flex]} />
        </View>

        <View style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Người trả: ${from}`} onPress={() => setPicking('from')} style={[styles.select, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <AppText weight="semibold" style={styles.selectText} numberOfLines={1}>
              {from}
            </AppText>
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <SvgIcon name="chevronRight" size={16} color={colors.muted} />
            </View>
          </Pressable>
          <AppText weight="semibold" style={styles.arrow} accessibilityLabel="đưa tiền cho">
            →
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={`Người nhận: ${effectiveTo || 'chưa có'}`} onPress={() => setPicking('to')} style={[styles.select, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <AppText weight="semibold" color={effectiveTo ? colors.ink : colors.muted} style={styles.selectText} numberOfLines={1}>
              {effectiveTo || 'Chưa có người'}
            </AppText>
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <SvgIcon name="chevronRight" size={16} color={colors.muted} />
            </View>
          </Pressable>
        </View>

        <View style={[styles.types, { backgroundColor: colors.bg }]} accessibilityRole="radiogroup">
          {(['bill', 'vay'] as const).map((id) => {
            const selected = type === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  setType(id);
                  setTypeChosen(true);
                }}
                style={[styles.typeButton, selected && { backgroundColor: colors.surface }]}>
                <AppText weight="semibold" color={selected ? colors.primary : colors.muted} style={styles.typeText}>
                  {id === 'bill' ? 'Trả bill' : 'Chuyển tiền'}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.amountBox}>
          <TextInput
            value={amountText}
            onChangeText={(text) => setAmountText(maskPayAmount(text))}
            keyboardType="decimal-pad"
            placeholder="Số tiền"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Số tiền, nghìn đồng"
            style={[inputStyle, styles.amountInput]}
          />
          <AppText color={colors.muted} style={styles.amountSuffix} pointerEvents="none">
            .000 ₫
          </AppText>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canRecord || busy }}
            disabled={!canRecord || busy}
            onPress={() => void save()}
            style={[styles.primary, { backgroundColor: colors.primary, opacity: canRecord && !busy ? 1 : 0.45 }]}>
            <SvgIcon name="check" size={20} color={colors.primaryInk} strokeWidth={2.2} />
            <AppText weight="semibold" color={colors.primaryInk} style={styles.primaryText}>
              {editing ? 'Lưu thay đổi' : 'Ghi nhận'}
            </AppText>
          </Pressable>
          {editing && (
            <Pressable accessibilityRole="button" onPress={() => onFinished?.()} style={[styles.ghost, { borderColor: colors.line }]}>
              <AppText weight="semibold" color={colors.muted} style={styles.ghostText}>
                Hủy sửa
              </AppText>
            </Pressable>
          )}
        </View>
        {editing && (
          <Pressable accessibilityRole="button" onPress={() => void remove()} style={[styles.delete, { backgroundColor: deleteArmed ? '#D64545' : colors.dangerSoft }]}>
            <AppText weight="semibold" color={deleteArmed ? '#FFFFFF' : colors.danger}>
              {deleteArmed ? 'Bấm lần nữa để xóa' : 'Xóa khoản này'}
            </AppText>
          </Pressable>
        )}
      </View>

      {!editing && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/cong-no/lich-su')} style={[styles.history, { borderColor: colors.line }]}>
          <AppText weight="semibold" color={colors.primary} style={styles.ghostText}>
            Lịch sử giao dịch
          </AppText>
        </Pressable>
      )}

      {picking && (
        <OptionPicker
          title={picking === 'from' ? 'Người trả' : 'Người nhận'}
          options={picking === 'from' ? options : toOptions}
          selected={picking === 'from' ? from : effectiveTo}
          emptyText="Chưa có người"
          onClose={() => setPicking(null)}
          onPick={(option) => {
            if (picking === 'from') {
              setFrom(option);
              if (option === to) setTo('');
            } else setTo(option);
            if (!typeChosen && !editing) setType('vay'); // như PWA: đổi người thì loại về mặc định nếu chưa tự chọn
            setPicking(null);
          }}
        />
      )}

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
    </ScrollView>
  );
}

// Số đo theo CSS `.mod-c` của PWA: thẻ bo 16 đệm 14; ô ngày rộng 150; ô chọn người cao 58; mũi tên 34; nút loại cao 38 bo 9;
// ô số tiền lớn; "Ghi nhận" cao 50.
const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 12, paddingTop: 4, gap: 12 },
  loading: { marginTop: 40 },
  notice: { marginHorizontal: 12, marginTop: 12, padding: 14, borderRadius: 14 },
  noticeText: { fontSize: 14, lineHeight: 20 },
  card: { borderRadius: AppRadius.card, borderWidth: 1, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBox: { width: 150 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  select: { flex: 1, minWidth: 0, minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectText: { flex: 1, fontSize: 16 },
  arrow: { fontSize: 30, lineHeight: 34, paddingHorizontal: 2 },
  types: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 12 },
  typeButton: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  typeText: { fontSize: 13.5 },
  amountBox: { justifyContent: 'center' },
  amountInput: { height: 62, fontSize: 30, paddingRight: 78, textAlign: 'right' },
  amountSuffix: { position: 'absolute', right: 15, fontSize: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  primary: { flex: 1, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { fontSize: 17 },
  ghost: { minHeight: 50, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 14.5 },
  delete: { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  history: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
