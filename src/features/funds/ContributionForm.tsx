import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { MoneyTextInput } from '@/components/money-input';
import { KeyboardAnchor } from '@/components/keyboard-aware-scroll';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { saveContributionSynced } from '@/data/fundService';
import {
  PERSON_NAME_MAX,
  buildContributionPeople,
  clampPeopleCount,
  contributionSavedMessage,
  contributionSummary,
  contributionTitle,
  rowsFromContribution,
  resizeRows,
  setAllAmounts,
  validateContribution,
  type PersonRow,
} from '@/domain/fundForms';
import { formatVndInput, maskVndInput, parseVndInput } from '@/domain/money';
import { describeFundError } from '@/features/funds/hooks';
import { PersonPicker } from '@/features/people/PersonPicker';
import { useColors } from '@/hooks/use-colors';
import type { Contribution, Fund } from '@/types/fund';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Dòng trong form giữ chữ số của ô tiền (ĐỒNG); ô nhập hiển thị dấu chấm hàng nghìn, đổi qua lại bằng `parseVndInput` / `formatVndInput`. */
interface FormRow {
  name: string;
  text: string;
}

const toPerson = (row: FormRow): PersonRow => ({ name: row.name, amount: parseVndInput(row.text) });
const toForm = (row: PersonRow): FormRow => ({ name: row.name, text: formatVndInput(row.amount) });

interface Props {
  fund: Fund;
  /** Có giá trị = đang sửa lần đóng này. */
  existing?: Contribution | null;
  /** Gọi sau khi lưu / xoá xong (màn cha đọc lại dữ liệu). */
  onChanged: () => void;
}

/**
 * Form đóng quỹ (khoản thu): nội dung, ngày, số người (1–200), "Áp dụng cho tất cả" + số tiền mỗi người,
 * từng dòng tên + số tiền. Ô tiền nhập và lưu theo đồng. Tên cho nhập tự do; đúng chữ "Tôi"
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
  const [eachText, setEachText] = useState(initial?.all ? formatVndInput(initial.each) : '');
  const [error, setError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  /** Dòng đang mở bảng chọn người từ danh sách (null = đóng). */
  const [pickingRow, setPickingRow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = contributionSummary(rows.map(toPerson));
  const inputStyle = [styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }];

  /** Đổi số người (1–200): bớt thì cắt cuối, thêm thì dòng trống; đang áp dụng "mỗi người" thì dòng mới có sẵn số tiền đó. */
  function setCount(next: number) {
    setRows(resizeRows(rows.map(toPerson), next, all ? parseVndInput(eachText) : 0).map(toForm));
  }

  /** Nhập ô "Mỗi người": mặc định áp dụng cho TẤT CẢ các dòng (nhập số riêng ở một dòng thì thôi áp dụng chung). */
  function changeEach(text: string) {
    const masked = maskVndInput(text);
    setEachText(masked);
    setAll(true);
    setRows(setAllAmounts(rows.map(toPerson), parseVndInput(masked)).map(toForm));
  }

  function changeRow(index: number, patch: Partial<FormRow>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    if (patch.text !== undefined) setAll(false); // sửa số riêng một người: không còn áp dụng chung
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
        <MoneyTextInput
          value={parseVndInput(eachText)}
          onChangeValue={(vnd) => changeEach(formatVndInput(vnd))}
          placeholder="Mỗi người (₫)"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Số tiền mỗi người"
          style={[inputStyle, styles.each]}
        />
      </View>

      <View style={styles.listHead}>
        <AppText weight="semibold" color={colors.muted} style={styles.listTitle}>
          Người đóng
        </AppText>
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
      <View style={styles.head}>
        <AppText weight="semibold" color={colors.muted} style={[styles.headText, styles.flex]}>
          Tên người đóng
        </AppText>
        <AppText weight="semibold" color={colors.muted} style={[styles.headText, styles.amountCol]}>
          Số tiền (₫)
        </AppText>
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.personRow}>
          <View style={[styles.nameBox, styles.flex]}>
            <TextInput
              value={row.name}
              onChangeText={(name) => changeRow(index, { name })}
              maxLength={PERSON_NAME_MAX}
              placeholder="Tên người"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`Tên người đóng ${index + 1}`}
              style={[inputStyle, styles.nameInput]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={`Chọn người ${index + 1} từ danh sách`} onPress={() => setPickingRow(index)} style={styles.pickButton}>
              <View style={{ transform: [{ rotate: '90deg' }] }}>
                <SvgIcon name="chevronRight" size={16} color={colors.muted} />
              </View>
            </Pressable>
          </View>
          <MoneyTextInput
            value={parseVndInput(row.text)}
            onChangeValue={(vnd) => changeRow(index, { text: formatVndInput(vnd) })}
            placeholder="0"
            placeholderTextColor={colors.muted}
            accessibilityLabel={`Số tiền người ${index + 1}`}
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

      <KeyboardAnchor>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void save()}
          style={[styles.primary, { backgroundColor: colors.primary, borderColor: colors.primary }]}
        >
          <AppText weight="semibold" color={colors.primaryInk} style={styles.primaryText}>
            {existing ? 'Lưu thay đổi' : 'Lưu khoản thu'}
          </AppText>
        </Pressable>
      </KeyboardAnchor>

      {pickingRow !== null && rows[pickingRow] && (
        <PersonPicker
          title="Chọn người đóng"
          selected={rows[pickingRow].name.trim() || null}
          onClose={() => setPickingRow(null)}
          onPick={(name) => {
            changeRow(pickingRow, { name });
            setPickingRow(null);
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
  count: { width: 36, textAlign: 'center', fontSize: 16, padding: 0 },
  people: { fontSize: 13, marginRight: 2 },
  check: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, justifyContent: 'center' },
  checkText: { fontSize: 14 },
  each: { flex: 1, minWidth: 0, textAlign: 'right' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  headText: { fontSize: 12.5 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  listTitle: { fontSize: 14 },
  amountCol: { width: 128 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameBox: { justifyContent: 'center' },
  nameInput: { paddingRight: 36 },
  pickButton: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 36, alignItems: 'center', justifyContent: 'center' },
  amountInput: { textAlign: 'right' },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, paddingTop: 10 },
  totalText: { fontSize: 14 },
  totalAmount: { fontSize: 17 },
  error: { fontSize: 13.5 },
  primary: { minHeight: 46, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16 },
  delete: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
