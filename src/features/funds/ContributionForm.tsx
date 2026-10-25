import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { FormLabel, formStyles } from '@/components/expense-form-parts';
import { InlineMultiSelect } from '@/components/inline-multi-select';
import { InlineSelect } from '@/components/inline-select';
import { KeyboardAnchor } from '@/components/keyboard-aware-scroll';
import { MoneyTextInput } from '@/components/money-input';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { saveContributionSynced } from '@/data/fundService';
import { loadPeople } from '@/data/peopleRepository';
import {
  MAX_PEOPLE,
  PERSON_NAME_MAX,
  buildContributionPeople,
  contributionSavedMessage,
  contributionSummary,
  contributionTitle,
  rowsFromContribution,
  validateContribution,
  type PersonRow,
} from '@/domain/fundForms';
import { FUND_OWNER_NAME } from '@/domain/funds';
import { formatVndInput, parseVndInput } from '@/domain/money';
import { memberOptions } from '@/domain/people';
import { describeFundError } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Contribution, Fund } from '@/types/fund';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Dòng trong form: `custom` = thành viên "khác" nhập tên thủ công (tên không bắt buộc, trống thì lưu "Người N"); còn lại là thành viên chọn từ danh sách.
 * `text` giữ chữ số của ô tiền (ĐỒNG); ô nhập hiển thị dấu chấm hàng nghìn, đổi qua lại bằng `parseVndInput` / `formatVndInput`.
 */
interface FormRow {
  name: string;
  text: string;
  custom: boolean;
}

const toPerson = (row: FormRow): PersonRow => ({ name: row.name, amount: parseVndInput(row.text) });

interface Props {
  fund: Fund;
  /** Có giá trị = đang sửa lần đóng này. */
  existing?: Contribution | null;
  /** Ô ở hàng đầu thẻ trên (ô chọn quỹ khi thêm mới). */
  header?: ReactNode;
  /** Gọi sau khi lưu / xoá xong (màn cha đọc lại dữ liệu). */
  onChanged: () => void;
}

/** Từ số người này trở lên (khi dùng "Thêm nhiều thành viên") form tự chuyển sang "Áp dụng cho tất cả". */
const BULK_ALL_THRESHOLD = 100;

const MODE_OPTIONS = [
  { key: 'all', name: 'Áp dụng cho tất cả' },
  { key: 'each', name: 'Nhập từng người' },
] as const;

/**
 * Form đóng quỹ (khoản thu), cùng giao diện trang tạo bill: thẻ trên gồm ô chọn quỹ (do màn cha đưa vào), ô chọn thành viên xổ xuống kèm "Thêm thành viên khác" (nhập số người,
 * mỗi người thêm là một dòng nhập tên thủ công), nội dung và ngày; thẻ dưới là "Danh sách đóng quỹ" (số người ở góc phải), ô chọn "Áp dụng cho tất cả / Nhập từng người"
 * (mặc định áp dụng tất cả: nhập tiền ở một người thì mọi người cùng số đó) và từng dòng tên + số tiền. Ô tiền nhập và lưu theo đồng. Đúng chữ "Tôi" là phần của chính mình
 * và được đồng bộ sang chi tiêu cá nhân.
 */
export function ContributionForm({ fund, existing, header, onChanged }: Props) {
  const colors = useColors();
  const toast = useToast();
  const today = todayStr();
  const [initial] = useState(() => (existing ? rowsFromContribution(existing) : null));

  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? today);
  const [rows, setRows] = useState<FormRow[]>(() =>
    initial ? initial.rows.map((row) => ({ name: row.name, text: formatVndInput(row.amount), custom: !!existing?.bulk })) : [{ name: FUND_OWNER_NAME, text: '', custom: false }],
  );
  const [all, setAll] = useState(initial ? initial.all : true);
  const [eachText, setEachText] = useState(initial?.all ? formatVndInput(initial.each) : '');
  /** Chế độ "Thêm nhiều thành viên": ô Thành viên thành ô nhập số người, mỗi người là một dòng nhập tên thủ công. */
  const [outside, setOutside] = useState(!!existing?.bulk);
  /** Vừa quay về chọn từ danh sách: ô Thành viên hiện ra với danh sách đã xổ sẵn. */
  const [listOpen, setListOpen] = useState(false);
  const [error, setError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [peopleList, setPeopleList] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPeople()
      .then((list) => {
        if (cancelled) return;
        setPeopleList(list);
        // Sửa khoản thu cũ: người đã lưu mà không còn trong mục Thiết lập thì thành dòng nhập tên thủ công (không đưa lại vào danh sách chọn).
        setRows((current) => current.map((row) => (row.custom || row.name === FUND_OWNER_NAME || list.includes(row.name) ? row : { ...row, custom: true })));
      })
      .catch(() => undefined); // danh sách người không đọc được: vẫn chọn được các tên đang có
    return () => {
      cancelled = true;
    };
  }, []);

  const memberRows = rows.filter((row) => !row.custom);
  const customRows = rows.filter((row) => row.custom);
  const selectedNames = memberRows.map((row) => row.name);
  // Chỉ "Tôi" và những người trong mục Thiết lập.
  const options = memberOptions(peopleList, []);
  const summary = contributionSummary(rows.map(toPerson));
  const rowText = (text: string) => (all ? eachText : text);

  /** Dựng lại danh sách dòng: các thành viên đã chọn rồi tới các dòng "khác"; dòng mới mang sẵn số tiền chung nếu đang áp dụng tất cả. */
  function rebuild(nextMembers: FormRow[], nextCustom: FormRow[]) {
    setRows([...nextMembers, ...nextCustom]);
    setError('');
  }

  function toggleMember(name: string) {
    if (selectedNames.includes(name)) rebuild(memberRows.filter((row) => row.name !== name), customRows);
    else if (rows.length < MAX_PEOPLE) rebuild([...memberRows, { name, text: all ? eachText : '', custom: false }], customRows);
  }

  /** Vào chế độ ngoài danh sách: bỏ các thành viên đã chọn, bắt đầu với một dòng nhập tên thủ công. */
  function enterOutside() {
    setListOpen(false);
    setOutside(true);
    rebuild([], [{ name: '', text: all ? eachText : '', custom: true }]);
  }

  /** Quay về chọn từ danh sách (mặc định lại chỉ có "Tôi"). */
  function leaveOutside() {
    setOutside(false);
    setListOpen(true);
    rebuild([{ name: FUND_OWNER_NAME, text: all ? eachText : '', custom: false }], []);
  }

  function setCustomCount(count: number) {
    const target = Math.max(0, Math.min(count, MAX_PEOPLE));
    // Trên 100 người: mặc định "Áp dụng cho tất cả" (nhập từng người quá dài); người dùng vẫn đổi lại được.
    const forceAll = target > BULK_ALL_THRESHOLD && customRows.length <= BULK_ALL_THRESHOLD && !all;
    const text = forceAll ? formatVndInput(parseVndInput(eachText) || rows.map((row) => parseVndInput(row.text)).find((amount) => amount > 0) || 0) : eachText;
    const applyAll = all || forceAll;
    if (forceAll) {
      setAll(true);
      setEachText(text);
    }
    const next = customRows.slice(0, target).map((row) => (forceAll ? { ...row, text } : row));
    while (next.length < target) next.push({ name: '', text: applyAll ? text : '', custom: true });
    rebuild([], next);
  }

  /** Đổi chế độ nhập tiền: "tất cả" lấy số của người đầu có tiền (hoặc số đang nhập) áp cho mọi dòng; "từng người" giữ nguyên số hiện có để sửa riêng. */
  function chooseMode(key: string) {
    if (key === 'all') {
      const first = parseVndInput(eachText) || rows.map((row) => parseVndInput(row.text)).find((amount) => amount > 0) || 0;
      const text = formatVndInput(first);
      setEachText(text);
      setRows(rows.map((row) => ({ ...row, text })));
      setAll(true);
    } else setAll(false);
    setError('');
  }

  function changeAmount(index: number, vnd: number) {
    const text = formatVndInput(vnd);
    if (all) {
      setEachText(text);
      setRows(rows.map((row) => ({ ...row, text })));
    } else setRows(rows.map((row, i) => (i === index ? { ...row, text } : row)));
    setError('');
  }

  function changeName(index: number, name: string) {
    setRows(rows.map((row, i) => (i === index ? { ...row, name } : row)));
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
        bulk: outside,
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
    setRows([{ name: FUND_OWNER_NAME, text: '', custom: false }]);
    setAll(true);
    setEachText('');
    setOutside(false);
    setError('');
  }

  const personBadge = (
    <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
      <SvgIcon name="people" size={16} color={colors.primary} strokeWidth={2} />
    </View>
  );
  const modeBadge = (name: 'copy' | 'list') => (
    <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
      <SvgIcon name={name} size={16} color={colors.primary} strokeWidth={2} />
    </View>
  );
  const memberSummary = selectedNames.join(', ');
  const inputFont = { color: colors.ink, fontFamily: AppFonts.semibold };

  return (
    <View style={styles.form}>
      <View style={[formStyles.card, { backgroundColor: colors.surface }]}>
        {header}

        <View style={formStyles.field}>
          <FormLabel>Thành viên</FormLabel>
          {outside ? (
            <View style={[styles.outsideBox, { backgroundColor: colors.bg, borderColor: colors.line }]}>
              {personBadge}
              <TextInput
                value={customRows.length > 0 ? String(customRows.length) : ''}
                onChangeText={(text) => setCustomCount(parseInt(text.replace(/\D/g, ''), 10) || 0)}
                keyboardType="number-pad"
                placeholder="Nhập số người"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Số người ngoài danh sách"
                style={[styles.outsideInput, { color: colors.ink, fontFamily: AppFonts.semibold }]}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Chọn từ danh sách" onPress={leaveOutside} hitSlop={6} style={styles.outsideBackRow}>
                <AppText weight="semibold" color={colors.primary} style={styles.outsideBack}>
                  Chọn từ danh sách
                </AppText>
                <View style={{ transform: [{ rotate: '90deg' }] }}>
                  <SvgIcon name="chevronRight" size={16} color={colors.primary} strokeWidth={2} />
                </View>
              </Pressable>
            </View>
          ) : (
            <InlineMultiSelect
              initiallyOpen={listOpen}
              accessibilityLabel="Thành viên"
              icon={personBadge}
              summary={memberSummary}
              placeholder="Chọn thành viên"
              options={options.map((name) => ({ key: name, name }))}
              selectedKeys={selectedNames}
              emptyText="Chưa có ai trong danh sách người. Thêm người ở mục Thiết lập."
              onToggle={toggleMember}
              extra={{ label: 'Thêm nhiều thành viên', onPress: enterOutside }}
            />
          )}
        </View>

        <View style={formStyles.field}>
          <FormLabel>Nội dung</FormLabel>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ví dụ: Quỹ tháng 10"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Nội dung"
            style={[formStyles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
          />
        </View>

        <View style={formStyles.field}>
          <FormLabel>Ngày</FormLabel>
          <DateField value={date} onPress={() => setCalendarOpen(true)} />
        </View>
      </View>

      <View style={[formStyles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.listHead}>
          <AppText weight="bold" style={styles.listTitle}>
            Danh sách đóng quỹ
          </AppText>
          <AppText color={colors.muted} style={styles.listCount}>
            {rows.length} người
          </AppText>
        </View>

        <InlineSelect
          accessibilityLabel="Cách nhập số tiền"
          selectedKey={all ? 'all' : 'each'}
          onSelect={chooseMode}
          options={MODE_OPTIONS.map((option) => ({ key: option.key, name: option.name, icon: modeBadge(option.key === 'all' ? 'copy' : 'list') }))}
        />

        {rows.length === 0 && (
          <AppText color={colors.muted} style={styles.empty}>
            {outside ? 'Nhập số người ở trên để nhập số tiền đóng.' : 'Chọn thành viên ở trên để nhập số tiền đóng.'}
          </AppText>
        )}
        {all && rows.length > 0 && (
          // Áp dụng cho tất cả: chỉ MỘT ô nhập số tiền, áp cho mọi người đã chọn / đã thêm (tên vẫn được ghi nhận khi lưu).
          <View style={[styles.personRow, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <View style={styles.nameBox}>
              <AppText weight="semibold" style={styles.nameText} numberOfLines={1}>
                Mỗi người
              </AppText>
            </View>
            <View style={styles.amountBox}>
              <MoneyTextInput
                value={parseVndInput(eachText)}
                onChangeValue={(vnd) => changeAmount(0, vnd)}
                placeholder="Nhập số tiền"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Số tiền mỗi người"
                style={[styles.moneyInput, inputFont]}
              />
              <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                ₫
              </AppText>
            </View>
          </View>
        )}
        {!all &&
          rows.map((row, index) => (
          <View key={`${row.custom ? 'c' : 'm'}${row.custom ? index : row.name}`} style={[styles.personRow, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <View style={styles.nameBox}>
              {row.custom ? (
                <TextInput
                  value={row.name}
                  onChangeText={(name) => changeName(index, name)}
                  maxLength={PERSON_NAME_MAX}
                  placeholder="Tên"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel={`Tên người đóng ${index + 1}`}
                  style={[styles.nameInput, inputFont]}
                />
              ) : (
                <AppText weight={row.name === FUND_OWNER_NAME ? 'bold' : 'semibold'} style={styles.nameText} numberOfLines={1}>
                  {row.name}
                </AppText>
              )}
            </View>
            <View style={styles.amountBox}>
              <MoneyTextInput
                value={parseVndInput(rowText(row.text))}
                onChangeValue={(vnd) => changeAmount(index, vnd)}
                placeholder="Nhập số tiền"
                placeholderTextColor={colors.muted}
                accessibilityLabel={`Số tiền người ${index + 1}`}
                style={[styles.moneyInput, inputFont]}
              />
              <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                ₫
              </AppText>
            </View>
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
          <AppText color={colors.danger} style={formStyles.error} accessibilityRole="alert">
            {error}
          </AppText>
        )}

        <KeyboardAnchor style={formStyles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void save()}
            style={[formStyles.btn, formStyles.btnSave, { backgroundColor: colors.primary }, busy && formStyles.disabled]}
          >
            <AppText weight="semibold" color={colors.primaryInk} style={formStyles.btnText}>
              {existing ? 'Lưu thay đổi' : 'Lưu khoản thu'}
            </AppText>
          </Pressable>
        </KeyboardAnchor>
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
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  listTitle: { fontSize: 15 },
  listCount: { fontSize: 13 },
  empty: { fontSize: 13, paddingVertical: 4 },
  outsideBox: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderWidth: 1, borderRadius: 12 },
  outsideInput: { flex: 1, minWidth: 0, height: 34, fontSize: 15, padding: 0 },
  outsideBackRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  outsideBack: { fontSize: 13 },
  /** Một khung liền: tên bên trái, ô nhập số tiền bên phải (cùng dáng dòng người đóng của trang tạo bill). */
  personRow: { flexDirection: 'row', alignItems: 'center', height: 46, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  nameBox: { flexBasis: '34%', maxWidth: '34%', height: 46, paddingHorizontal: 12, justifyContent: 'center' },
  nameText: { fontSize: 15 },
  nameInput: { height: 46, fontSize: 15, padding: 0 },
  amountBox: { flex: 1, minWidth: 0, height: 46, justifyContent: 'center' },
  moneyInput: { height: 46, paddingLeft: 10, paddingRight: 30, fontSize: 15, textAlign: 'right' },
  suffix: { position: 'absolute', right: 12, fontSize: 15 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, paddingTop: 10 },
  totalText: { fontSize: 14 },
  totalAmount: { fontSize: 17 },
});
