import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { AppTextInput as TextInput } from '@/components/app-text-input';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { MoneyTextInput } from '@/components/money-input';
import { KeyboardAnchor, KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { CalendarPanel } from '@/components/calendar-panel';
import { CategoryIcon } from '@/components/category-icon';
import { DateField } from '@/components/date-field';
import { PhotoField } from '@/features/photos/PhotoViews';
import { FormLabel, formStyles } from '@/components/expense-form-parts';
import { InlineMultiSelect } from '@/components/inline-multi-select';
import { InlineSelect } from '@/components/inline-select';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { BillInputError, loadBillNames } from '@/data/billRepository';
import { saveBillSynced } from '@/data/billService';
import { loadPeople } from '@/data/peopleRepository';
import { BILL_OWNER_NAME, MAX_BILL_PEOPLE, MIN_BILL_PEOPLE, canSaveBill, computeSplit, defaultPersonName } from '@/domain/bills';
import {
  applyMemberSelection,
  emptyPerson,
  initialPeople,
  resetAfterSave,
  toSplitPeople,
  withFixedText,
  withWeightText,
  type FormPerson,
} from '@/domain/billForm';
import { formFromBill } from '@/domain/billHistory';
import { formatVndInput, parseVndInput } from '@/domain/money';
import { allCategories } from '@/domain/expenses';
import { describeStorageError, useExpenseSettings } from '@/features/expenses/hooks';
import { memberOptions } from '@/domain/people';
import { SplitReceipt } from '@/features/bills/SplitReceipt';

import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import { useSlideToggle } from '@/hooks/use-slide-toggle';
import type { Bill } from '@/types/bill';
import type { DateStr } from '@/types/expense';
import { todayStr } from '@/utils/date';

/** Các mục chi của bill và thứ tự hiển thị, như PWA (`ne`). */
const BILL_CATEGORY_IDS = ['food', 'fun', 'trip', 'move', 'bill', 'other'];

/**
 * Màn tính chia bill (phần "Chia bill" của tab Giao dịch): nội dung, mục chi, ngày, số người 2–20, số tiền mỗi
 * người đã chi (đồng) và kết quả chia theo thời gian thực. Vuốt ô tiền sang trái để đặt hệ số hoặc mức
 * cố định. Có `existing` thì là chế độ SỬA bill đó (lưu xong gọi `onFinished`, không đặt lại form). Tạo mới thì lưu xong ở lại trang (xoá tiền, hệ số, nội dung; giữ nhóm người và ngày) để tạo tiếp, KHÔNG gọi `onFinished`.
 */
export default function BillCalcScreen({ existing = null, onFinished }: { existing?: Bill | null; onFinished?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref: scrollRef, props: scrollProps } = useChromeScroll(!existing && !onFinished);
  const today = todayStr();
  const { settings } = useExpenseSettings();

  const [initial] = useState(() => (existing ? formFromBill(existing) : null));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState<DateStr>(initial?.date ?? today);
  const [catId, setCatId] = useState(initial?.cat ?? 'food');
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [rows, setRows] = useState<FormPerson[]>(initial?.rows ?? [emptyPerson('Tôi')]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [peopleList, setPeopleList] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** Mã các ảnh đính kèm (hóa đơn…); lưu cùng bill. */
  const [photos, setPhotos] = useState<string[]>(existing?.ph ? [...existing.ph] : []);
  /** Ô cảnh báo (mức cố định lớn hơn tổng bill) chỉ hiện sau khi bấm Lưu bill mà không hợp lệ; sửa số liệu thì ẩn lại. */
  const [showProblem, setShowProblem] = useState(false);
  const touched = useRef(!!existing);
  const toast = useToast();

  // Nhóm người của lần chia gần nhất (chỉ giữ người còn trong Danh sách người), như PWA; lỗi đọc thì dùng mặc định.
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBillNames(), loadPeople()])
      .then(([names, people]) => {
        if (cancelled) return;
        setPeopleList(people);
        if (!touched.current) setRows(initialPeople(names, people));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const all = allCategories(settings);
    return BILL_CATEGORY_IDS.map((id) => all.find((cat) => cat.id === id)).filter((cat): cat is NonNullable<typeof cat> => !!cat);
  }, [settings]);
  const category = categories.find((cat) => cat.id === catId) ?? categories[categories.length - 1];

  const people = useMemo(() => toSplitPeople(rows), [rows]);
  const split = useMemo(() => computeSplit(people), [people]);

  function update(next: FormPerson[]) {
    touched.current = true;
    setShowProblem(false);
    setRows(next);
  }
  const patchRow = (index: number, change: (row: FormPerson) => FormPerson) => update(rows.map((row, i) => (i === index ? change(row) : row)));
  /** Danh sách thành viên để chọn: "Tôi", Danh sách người, rồi các tên đang có trong bill mà chưa nằm trong danh sách. */
  const memberChoices = memberOptions(peopleList, rows.map((row) => row.name).filter(Boolean));
  function toggleMember(name: string) {
    if (name === BILL_OWNER_NAME) return;
    const chosen = rows.map((row) => row.name).filter((item) => item && item !== BILL_OWNER_NAME);
    const on = chosen.includes(name);
    if (!on && rows.length >= MAX_BILL_PEOPLE) {
      toast.show(`Tối đa ${MAX_BILL_PEOPLE} người.`);
      return;
    }
    setOpenRow(null);
    const next = on ? chosen.filter((item) => item !== name) : [...chosen, name];
    update(applyMemberSelection(rows, memberChoices.filter((option) => option !== BILL_OWNER_NAME && next.includes(option))));
  }

  async function save() {
    if (saving) return;
    if (!canSaveBill(split)) {
      if (split.bad) setShowProblem(true);
      else toast.show(split.n < MIN_BILL_PEOPLE ? 'Chọn ít nhất 2 thành viên.' : 'Nhập số tiền đã chi.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveBillSynced({ id: existing?.id, title, date, cat: catId, people, ph: photos });
      if (existing) {
        if (saved.value === null) {
          toast.show('Không tìm thấy bill này. Có thể nó đã bị xoá.');
          return;
        }
        toast.show('Đã lưu thay đổi');
        onFinished?.();
        return;
      }
      toast.show('Đã lưu vào lịch sử');
      // Như PWA: xoá tiền / hệ số / mức cố định và nội dung, giữ nhóm người và ngày cho lần chia sau.
      update(resetAfterSave(rows));
      setTitle('');
      setPhotos([]);
      setCatId('food');
      setOpenRow(null);
      // Tạo mới: ở lại trang để tạo tiếp (không quay lại); chỉ sửa một bill mới quay về.
    } catch (e) {
      toast.show(e instanceof BillInputError ? e.message : describeStorageError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScrollView ref={scrollRef} {...scrollProps} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <View style={[formStyles.card, { backgroundColor: colors.surface }]}>
        <View style={formStyles.field}>
          <FormLabel>Thành viên</FormLabel>
          <InlineMultiSelect
            accessibilityLabel="Thành viên"
            icon={
              <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
                <SvgIcon name="people" size={16} color={colors.primary} strokeWidth={2} />
              </View>
            }
            summary={rows.map((row) => row.name).filter(Boolean).join(', ')}
            placeholder="Chọn thành viên"
            options={memberChoices.map((name) => ({ key: name, name, locked: name === BILL_OWNER_NAME }))}
            selectedKeys={rows.map((row) => row.name)}
            emptyText="Chưa có ai trong danh sách người. Thêm người ở mục Thiết lập."
            onToggle={toggleMember}
          />
        </View>

        <View style={formStyles.field}>
          <FormLabel>Mục chi</FormLabel>
          <InlineSelect
            accessibilityLabel="Mục chi"
            selectedKey={category.id}
            onSelect={setCatId}
            options={categories.map((cat) => ({ key: cat.id, name: cat.name, icon: <CategoryIcon category={cat} size={28} /> }))}
          />
        </View>

        <View style={formStyles.field}>
          <FormLabel>Nội dung</FormLabel>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ví dụ: Ăn trưa, cà phê"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Tên nội dung"
            style={[formStyles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
          />
        </View>

        <View style={formStyles.field}>
          <FormLabel>Ngày</FormLabel>
          <DateField value={date} onPress={() => setCalendarOpen(true)} />
        </View>

        <PhotoField value={photos} onChange={setPhotos} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.listHead}>
          <AppText weight="bold" style={styles.listTitle}>
            Danh sách chia bill
          </AppText>
          <AppText color={colors.muted} style={styles.listCount}>
            {rows.length} người
          </AppText>
        </View>
        <AppText color={colors.muted} style={styles.hint}>
          Vuốt sang trái để nhập hệ số hoặc số tiền cố định
        </AppText>
        {rows.map((row, index) => (
          <PersonRow
            key={index}
            index={index}
            row={row}
            open={openRow === index}
            onOpen={(open) => setOpenRow(open ? index : null)}
            onChange={(change) => patchRow(index, change)}
          />
        ))}
      </View>

      <SplitReceipt split={split} showTotal showWarning={showProblem} />

      <KeyboardAnchor>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => void save()}
          style={[formStyles.btn, { backgroundColor: colors.primary }, saving && formStyles.disabled]}>
          <AppText weight="semibold" color={colors.primaryInk} style={formStyles.btnText}>
            {existing ? 'Lưu thay đổi' : 'Lưu bill'}
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
    </KeyboardAwareScrollView>
  );
}

interface PersonRowProps {
  index: number;
  row: FormPerson;
  open: boolean;
  onOpen: (open: boolean) => void;
  onChange: (change: (row: FormPerson) => FormPerson) => void;
}

/**
 * Một người trong "Danh sách chia bill": hai KHUNG LIỀN (mỗi khung là một viền chung chia hai ô) xếp chồng trong một khung cắt cao 46.
 * Khung 1: ô trái là tên (cố định theo danh sách thành viên), ô phải là số tiền người đó đã chi (có ₫ ở cuối). Khung 2: ô trái là "Hệ số" chia bill, ô phải là "Số tiền cố định"
 * người đó phải chịu. Vuốt ngang theo ngón tay: khung 1 trượt ra trái trong khi khung 2 trượt vào từ phải như hai khung dính liền nhau; thả tay giữa chừng thì tự trượt về vị trí gần hơn
 * (hoặc theo vận tốc). Khung 2 có nút "×" bên phải để quay lại (hoặc vuốt phải). Cả hai khung luôn được dựng nên dữ liệu đã nhập được giữ nguyên.
 */
function PersonRow({ index, row, open, onOpen, onChange }: PersonRowProps) {
  const colors = useColors();
  const { nameX, slideInX, gesture, onLayout } = useSlideToggle(open, onOpen);
  const frame = [styles.frame, { backgroundColor: colors.bg, borderColor: colors.line }];
  const inputStyle = [styles.moneyInput, { color: colors.ink, fontFamily: AppFonts.semibold }];
  const isMe = index === 0;
  const name = isMe ? 'Tôi' : row.name || defaultPersonName(index);
  // Vuốt sang khung kia (hoặc quay lại): bỏ chọn ô đang nhập và hạ bàn phím; ô mới KHÔNG tự được chọn, người dùng bấm vào ô nào mới nhập ô đó.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    Keyboard.dismiss();
  }, [open]);

  return (
    <View style={styles.person}>
      <View style={styles.personRow}>
        <GestureDetector gesture={gesture}>
          <View style={styles.slider} onLayout={onLayout}>
            <Animated.View
              style={[styles.panel, { transform: [{ translateX: nameX }] }]}
              pointerEvents={open ? 'none' : 'auto'}
              accessibilityElementsHidden={open}
              importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}>
              <View style={frame}>
                <View style={styles.nameBox}>
                  <AppText weight={isMe ? 'bold' : 'semibold'} color={isMe || row.name ? colors.ink : colors.muted} style={styles.nameText} numberOfLines={1}>
                    {name}
                  </AppText>
                </View>
                <View style={styles.amountBox}>
                  <MoneyTextInput
                    value={parseVndInput(row.paidText)}
                    onChangeValue={(vnd) => onChange((r) => ({ ...r, paidText: formatVndInput(vnd) }))}
                    placeholder="Nhập số tiền"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel={'Số tiền đã chi của ' + name}
                    style={[...inputStyle, styles.paidInput]}
                  />
                  <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                    ₫
                  </AppText>
                </View>
              </View>
            </Animated.View>
            <Animated.View
              style={[styles.panel, { transform: [{ translateX: slideInX }] }]}
              pointerEvents={open ? 'auto' : 'none'}
              accessibilityElementsHidden={!open}
              importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
              <View style={frame}>
                <View style={styles.nameBox}>
                  <View style={styles.weightWrap}>
                    <AppText weight="semibold" color={colors.muted} style={styles.times} pointerEvents="none">
                      x
                    </AppText>
                    <TextInput
                      value={row.weightText}
                      onChangeText={(text) => onChange((r) => withWeightText(r, text))}
                      keyboardType="decimal-pad"
                      placeholder="Hệ số"
                      placeholderTextColor={colors.muted}
                      maxLength={4}
                      accessibilityLabel="Hệ số chia"
                      style={[...inputStyle, styles.weightInput]}
                    />
                  </View>
                </View>
                <AppText color={colors.muted} style={styles.orText}>
                  hoặc
                </AppText>
                <View style={styles.amountBox}>
                  <MoneyTextInput
                    value={parseVndInput(row.fixedText)}
                    onChangeValue={(vnd) => onChange((r) => withFixedText(r, formatVndInput(vnd)))}
                    placeholder="Số tiền cố định"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Số tiền cố định"
                    style={[...inputStyle, styles.paidInput]}
                  />
                  <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                    ₫
                  </AppText>
                </View>
              </View>
            </Animated.View>
          </View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 12, paddingTop: 4, gap: 12 },
  card: { borderRadius: AppRadius.hero, padding: 16, gap: 8 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  listTitle: { fontSize: 15 },
  listCount: { fontSize: 13 },
  hint: { fontSize: 12.5, textAlign: 'center' },
  person: { gap: 2 },
  personRow: { flexDirection: 'row', alignItems: 'center' },
  /** Khung cắt cao cố định 46: hai khung liền trượt trong khung nên chiều cao dòng không đổi. */
  // `touchAction: 'pan-y'` (web): vuốt ngang được giao cho khung trượt, trình duyệt chỉ tự cuộn khi vuốt dọc.
  slider: { flex: 1, minWidth: 0, height: 46, overflow: 'hidden', touchAction: 'pan-y' },
  panel: { ...StyleSheet.absoluteFill },
  /** Khung liền: một viền chung chia hai ô (trái 34%, phải còn lại). */
  frame: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 46, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  nameBox: { flexBasis: '30%', maxWidth: '30%', height: 46, paddingHorizontal: 12, justifyContent: 'center' },
  nameText: { fontSize: 15 },
  amountBox: { flex: 1, minWidth: 0, height: 46, justifyContent: 'center' },
  moneyInput: { height: 46, paddingLeft: 10, fontSize: 15 },
  paidInput: { paddingRight: 30, textAlign: 'right' },
  suffix: { position: 'absolute', right: 12, fontSize: 15 },
  orText: { fontSize: 13, paddingHorizontal: 4 },
  weightWrap: { flex: 1, justifyContent: 'center' },
  /** Chữ "x" luôn đứng trước hệ số (vd. x2), kể cả khi chưa nhập. */
  times: { position: 'absolute', left: 0, fontSize: 15 },
  weightInput: { paddingRight: 0, paddingLeft: 12 },
});
