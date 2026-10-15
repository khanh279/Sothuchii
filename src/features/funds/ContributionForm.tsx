import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { deleteContributionSynced, saveContributionSynced } from '@/data/fundService';
import {
  PERSON_NAME_MAX,
  buildContributionPeople,
  clampPeopleCount,
  contributionSavedMessage,
  contributionSummary,
  contributionTitle,
  enableAllMode,
  resizeRows,
  rowsFromContribution,
  setAllAmounts,
  validateContribution,
  type PersonRow,
} from '@/domain/fundForms';
import { formatNghinInput, maskNghinInput, parseNghinInput } from '@/domain/money';
import { describeFundError } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Contribution, Fund } from '@/types/fund';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Dòng trong form giữ CHỮ người dùng gõ ở ô tiền (đơn vị nghìn đồng); số đồng suy ra bằng `parseNghinInput`. */
interface FormRow {
  name: string;
  text: string;
}

const toPerson = (row: FormRow): PersonRow => ({ name: row.name, amount: parseNghinInput(row.text) });
const toForm = (row: PersonRow): FormRow => ({ name: row.name, text: formatNghinInput(row.amount) });

interface Props {
  fund: Fund;
  /** Có giá trị = đang sửa lần đóng này. */
  existing?: Contribution | null;
  /** Gọi sau khi lưu / xoá xong (màn cha đọc lại dữ liệu). */
  onChanged: () => void;
}

/**
 * Form đóng quỹ (khoản thu): nội dung, ngày, số người (1–200), "Áp dụng cho tất cả" + số tiền mỗi người,
 * từng dòng tên + số tiền. Ô tiền nhập theo NGHÌN đồng, lưu theo đồng. Tên cho nhập tự do; đúng chữ "Tôi"
 * là phần của chính mình và được đồng bộ sang chi tiêu cá nhân.
 */
export function ContributionForm({ fund, existing, onChanged }: Props) {
  const colors = useColors();
  const toast = useToast();
  const today = todayStr();
  const initial = existing ? rowsFromContribution(existing) : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? today);
  const [rows, setRows] = useState<FormRow[]>(initial ? initial.rows.map(toForm) : [{ name: '', text: '' }]);
  const [all, setAll] = useState(initial ? initial.all : true);
  const [eachText, setEachText] = useState(initial?.all ? formatNghinInput(initial.each) : '');
  const [error, setError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const summary = contributionSummary(rows.map(toPerson));
  const inputStyle = [styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }];

  function setCount(next: number) {
    setRows(resizeRows(rows.map(toPerson), next, parseNghinInput(eachText)).map(toForm));
  }

  function toggleAll() {
    if (all) {
      setAll(false);
      return;
    }
    const enabled = enableAllMode(rows.map(toPerson), parseNghinInput(eachText));
    setAll(true);
    setEachText(formatNghinInput(enabled.each));
    setRows(enabled.rows.map(toForm));
  }

  function changeEach(text: string) {
    const masked = maskNghinInput(text);
    setEachText(masked);
    setRows(setAllAmounts(rows.map(toPerson), parseNghinInput(masked)).map(toForm));
  }

  function changeRow(index: number, patch: Partial<FormRow>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setError('');
  }

  async function save() {
    if (busy) return;
    const people = buildContributionPeople(rows.map(toPerson));
    const problem = validateContribution({ date, fundId: fund.id, people, all });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const result = await saveContributionSynced({
        id: existing?.id,
        fundId: fund.id,
        title: contributionTitle(title),
        date,
        people,
      });
      if (result.value === null) {
        setError('Không tìm thấy lần đóng quỹ này. Có thể nó đã bị xoá.');
        return;
      }
      toast.show(contributionSavedMessage(!!existing));
      if (!existing) reset();
      onChanged();
    } catch (e) {
      setError(e instanceof FundInputError ? e.message : describeFundError(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setTitle('');
    setDate(todayStr());
    setRows([{ name: '', text: '' }]);
    setAll(true);
    setEachText('');
    setError('');
  }

  async function remove() {
    if (!existing || busy) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setTimeout(() => setDeleteArmed(false), 3500);
      return;
    }
    setBusy(true);
    try {
      await deleteContributionSynced(existing.id);
      toast.show('Đã xóa lần đóng quỹ');
      onChanged();
    } catch (e) {
      setError(describeFundError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Nội dung (VD: Quỹ tháng 10)"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Nội dung"
        style={inputStyle}
      />

      <View style={styles.line}>
        <View style={styles.flex}>
          <DateField value={date} onPress={() => setCalendarOpen(true)} />
        </View>
        <View style={[styles.stepper, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Giảm số người" onPress={() => setCount(rows.length - 1)} style={styles.stepButton}>
            <AppText weight="bold" style={styles.stepText}>
              −
            </AppText>
          </Pressable>
          <TextInput
            value={String(rows.length)}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '');
              if (digits) setCount(clampPeopleCount(digits));
            }}
            keyboardType="number-pad"
            accessibilityLabel="Số người đóng"
            style={[styles.count, { color: colors.ink, fontFamily: AppFonts.bold }]}
          />
          <AppText color={colors.muted} style={styles.people}>
            người
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Tăng số người" onPress={() => setCount(rows.length + 1)} style={styles.stepButton}>
            <AppText weight="bold" style={styles.stepText}>
              +
            </AppText>
          </Pressable>
        </View>
      </View>

      <View style={styles.line}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: all }}
          onPress={toggleAll}
          style={[styles.check, { borderColor: all ? colors.primary : colors.line, backgroundColor: all ? colors.primarySoft : colors.bg }]}>
          <AppText weight="semibold" color={all ? colors.primary : colors.muted} style={styles.checkText}>
            Áp dụng cho tất cả
          </AppText>
        </Pressable>
        <TextInput
          value={eachText}
          onChangeText={changeEach}
          keyboardType="decimal-pad"
          placeholder="Mỗi người"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Số tiền mỗi người, nghìn đồng"
          style={[inputStyle, styles.each]}
        />
      </View>

      <View style={styles.head}>
        <AppText weight="semibold" color={colors.muted} style={[styles.headText, styles.noCol]}>
          STT
        </AppText>
        <AppText weight="semibold" color={colors.muted} style={[styles.headText, styles.flex]}>
          Tên người đóng
        </AppText>
        <AppText weight="semibold" color={colors.muted} style={[styles.headText, styles.amountCol]}>
          Số tiền (nghìn đồng)
        </AppText>
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.personRow}>
          <AppText weight="semibold" color={colors.muted} style={styles.noCol}>
            {index + 1}
          </AppText>
          <TextInput
            value={row.name}
            onChangeText={(name) => changeRow(index, { name })}
            maxLength={PERSON_NAME_MAX}
            placeholder="Tên người"
            placeholderTextColor={colors.muted}
            accessibilityLabel={`Tên người đóng ${index + 1}`}
            style={[inputStyle, styles.flex]}
          />
          <TextInput
            value={row.text}
            onChangeText={(text) => changeRow(index, { text: maskNghinInput(text) })}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            accessibilityLabel={`Số tiền người ${index + 1}, nghìn đồng`}
            style={[inputStyle, styles.amountCol, styles.amountInput]}
          />
        </View>
      ))}

      <View style={[styles.total, { borderTopColor: colors.line }]}>
        <AppText weight="semibold" color={colors.muted} style={styles.totalText}>
          Tổng ({summary.payers} người)
        </AppText>
        <AppText weight="bold" style={styles.totalAmount}>
          {formatVnd(summary.total)}
        </AppText>
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
          {existing ? 'Lưu thay đổi' : 'Lưu khoản thu'}
        </AppText>
      </Pressable>
      {existing && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void remove()}
          style={[styles.delete, { backgroundColor: deleteArmed ? '#D64545' : colors.dangerSoft }]}>
          <AppText weight="semibold" color={deleteArmed ? '#FFFFFF' : colors.danger}>
            {deleteArmed ? 'Bấm lần nữa để xóa' : 'Xóa lần đóng quỹ này'}
          </AppText>
        </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 2 },
  stepButton: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20 },
  count: { minWidth: 36, textAlign: 'center', fontSize: 16, padding: 0 },
  people: { fontSize: 13, marginRight: 2 },
  check: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, justifyContent: 'center' },
  checkText: { fontSize: 14 },
  each: { flex: 1, minWidth: 0, textAlign: 'right' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  headText: { fontSize: 12.5 },
  noCol: { width: 28, textAlign: 'center' },
  amountCol: { width: 128 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountInput: { textAlign: 'right' },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, paddingTop: 10 },
  totalText: { fontSize: 14 },
  totalAmount: { fontSize: 17 },
  error: { fontSize: 13.5 },
  primary: { minHeight: 46, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16 },
  delete: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
