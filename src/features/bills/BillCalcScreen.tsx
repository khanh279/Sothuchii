import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { MoneyTextInput } from '@/components/money-input';
import { KeyboardAnchor, KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { CalendarPanel } from '@/components/calendar-panel';
import { CategoryIcon } from '@/components/category-icon';
import { DateField } from '@/components/date-field';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { BillInputError, loadBillNames } from '@/data/billRepository';
import { saveBillSynced } from '@/data/billService';
import { loadPeople } from '@/data/peopleRepository';
import { MAX_BILL_PEOPLE, MIN_BILL_PEOPLE, canSaveBill, computeSplit, defaultPersonName } from '@/domain/bills';
import {
  applyMemberSelection,
  emptyPerson,
  initialPeople,
  resizePeople,
  resetAfterSave,
  toSplitPeople,
  weightCaption,
  withFixedText,
  withWeightText,
  type FormPerson,
} from '@/domain/billForm';
import { formFromBill } from '@/domain/billHistory';
import { formatVndInput, parseVndInput } from '@/domain/money';
import { allCategories } from '@/domain/expenses';
import { describeStorageError, useExpenseSettings } from '@/features/expenses/hooks';
import { MemberPicker } from '@/features/people/MemberPicker';
import { SplitReceipt } from '@/features/bills/SplitReceipt';
import { GestureDetector } from 'react-native-gesture-handler';

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
 * cố định. Có `existing` thì là chế độ SỬA bill đó (lưu xong gọi `onFinished`, không đặt lại form). Tạo mới mà có `onFinished`
 * (màn "Tạo bill" riêng) thì lưu xong cũng gọi `onFinished` để quay lại.
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
  const [rows, setRows] = useState<FormPerson[]>(initial?.rows ?? [emptyPerson('Tôi')]);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [pickingMembers, setPickingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const touched = useRef(!!existing);
  const toast = useToast();

  // Nhóm người của lần chia gần nhất (chỉ giữ người còn trong Danh sách người), như PWA; lỗi đọc thì dùng mặc định.
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBillNames(), loadPeople()])
      .then(([names, people]) => {
        if (!cancelled && !touched.current) setRows(initialPeople(names, people));
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
    setRows(next);
  }
  const patchRow = (index: number, change: (row: FormPerson) => FormPerson) => update(rows.map((row, i) => (i === index ? change(row) : row)));
  async function save() {
    if (saving || !canSaveBill(split)) return;
    setSaving(true);
    try {
      const saved = await saveBillSynced({ id: existing?.id, title, date, cat: catId, people });
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
      setCatId('food');
      setOpenRow(null);
      // Mở từ màn "Tạo bill" riêng: lưu xong quay lại danh sách.
      onFinished?.();
    } catch (e) {
      toast.show(e instanceof BillInputError ? e.message : describeStorageError(e));
    } finally {
      setSaving(false);
    }
  }

  const setCount = (count: number) => {
    setOpenRow(null);
    update(resizePeople(rows, count));
  };

  return (
    <KeyboardAwareScrollView ref={scrollRef} {...scrollProps} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Nội dung (VD: Ăn trưa, cà phê)"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Tên nội dung"
          style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mục chi: ${category.name}. Bấm để đổi`}
          onPress={() => setPickingCategory(true)}
          style={[styles.categoryButton, { backgroundColor: colors.bg, borderColor: colors.line }]}>
          <CategoryIcon category={category} size={34} />
          <AppText weight="semibold" style={styles.categoryName} numberOfLines={1}>
            {category.name}
          </AppText>
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <SvgIcon name="chevronRight" size={18} color={colors.muted} />
          </View>
        </Pressable>
        <View style={styles.dateRow}>
          <View style={styles.flex}>
            <DateField value={date} onPress={() => setCalendarOpen(true)} />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOpenRow(null);
              setPickingMembers(true);
            }}
            style={[styles.memberButton, { borderColor: colors.line, backgroundColor: colors.bg }]}>
            <SvgIcon name="people" size={18} color={colors.primary} />
            <AppText weight="semibold" color={colors.primary} style={styles.memberText}>
              Chọn thành viên
            </AppText>
          </Pressable>
        </View>

        <View style={styles.stepper}>
          <AppText weight="semibold" color={colors.muted} style={styles.stepperLabel}>
            Người đóng
          </AppText>
          <StepButton label="−" accessibilityLabel="Giảm số người" disabled={rows.length <= MIN_BILL_PEOPLE} onPress={() => setCount(rows.length - 1)} />
          <AppText weight="bold" style={styles.count} accessibilityLiveRegion="polite">
            {rows.length} <AppText color={colors.muted} style={styles.countUnit}>người</AppText>
          </AppText>
          <StepButton label="+" accessibilityLabel="Tăng số người" disabled={rows.length >= MAX_BILL_PEOPLE} onPress={() => setCount(rows.length + 1)} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <AppText color={colors.muted} style={styles.hint}>
          Vuốt sang trái để chọn hệ số hoặc số tiền cố định
        </AppText>
        {rows.map((row, index) => (
          <PersonRow
            key={index}
            index={index}
            row={row}
            open={openRow === index}
            caption={weightCaption(people[index])}
            onOpen={(open) => setOpenRow(open ? index : null)}
            onChange={(change) => patchRow(index, change)}
          />
        ))}
      </View>

      <KeyboardAnchor>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSaveBill(split) || saving }}
          disabled={!canSaveBill(split) || saving}
          onPress={() => void save()}
          style={[styles.saveButton, { backgroundColor: colors.primary, opacity: canSaveBill(split) && !saving ? 1 : 0.45 }]}>
          <SvgIcon name="check" size={20} color={colors.primaryInk} strokeWidth={2.2} />
          <AppText weight="semibold" color={colors.primaryInk} style={styles.saveText}>
            Lưu
          </AppText>
        </Pressable>
      </KeyboardAnchor>
      {!existing && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/chia-bill/lich-su')} style={[styles.ghostButton, { borderColor: colors.line }]}>
          <AppText weight="semibold" color={colors.primary} style={styles.ghostText}>
            Lịch sử bill
          </AppText>
        </Pressable>
      )}

      <SplitReceipt split={split} showTotal={false} />

      {pickingMembers && (
        <MemberPicker
          title="Người chia bill"
          selected={rows.map((row) => row.name).filter(Boolean)}
          onChange={(names) => update(applyMemberSelection(rows, names))}
          onClose={() => setPickingMembers(false)}
        />
      )}

      {pickingCategory && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setPickingCategory(false)}>
          <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
            <Pressable style={styles.flex} onPress={() => setPickingCategory(false)} accessibilityLabel="Đóng" />
            <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 16 + insets.bottom }]}>
              <AppText weight="bold" style={styles.sheetTitle}>
                Chọn mục chi
              </AppText>
              <View style={styles.grid}>
                {categories.map((cat) => {
                  const selected = cat.id === category.id;
                  return (
                    <Pressable
                      key={cat.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setCatId(cat.id);
                        setPickingCategory(false);
                      }}
                      style={[styles.gridItem, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? colors.primarySoft : colors.bg }]}>
                      <CategoryIcon category={cat} size={40} />
                      <AppText weight="semibold" style={styles.gridName} numberOfLines={1}>
                        {cat.name}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>
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
    </KeyboardAwareScrollView>
  );
}

function StepButton({ label, accessibilityLabel, disabled, onPress }: { label: string; accessibilityLabel: string; disabled: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepButton, { borderColor: colors.line, backgroundColor: colors.bg, opacity: disabled ? 0.4 : 1 }]}>
      <AppText weight="bold" style={styles.stepText}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface PersonRowProps {
  index: number;
  row: FormPerson;
  open: boolean;
  caption: string;
  onOpen: (open: boolean) => void;
  onChange: (change: (row: FormPerson) => FormPerson) => void;
}

/**
 * Một người: hai lớp ô cùng kích thước xếp chồng trong một khung cắt cao 46. Lớp 1 là "Tên" + "Số tiền chi", lớp 2 là
 * "Hệ số" hoặc "Số tiền cố định" (chữ "hoặc" ở giữa; đè đúng lên vị trí lớp 1). Kéo ngang theo ngón tay: lớp 1 trượt ra trái trong khi lớp 2 trượt vào từ phải
 * (và ngược lại); thả tay thì chốt về phía gần hơn (hoặc theo vận tốc). Không có nút "⋯"; ở lớp 2 có nút "×" bên phải để quay lại.
 * Cả hai lớp luôn được dựng nên dữ liệu đã nhập ở hai chế độ được giữ nguyên; chiều cao dòng cố định nên không nhảy.
 */
function PersonRow({ index, row, open, caption, onOpen, onChange }: PersonRowProps) {
  const colors = useColors();
  const { nameX, slideInX, gesture, onLayout } = useSlideToggle(open, onOpen);

  const inputStyle = [styles.moneyInput, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }];
  const isMe = index === 0;
  const name = isMe ? 'Tôi' : row.name || defaultPersonName(index);

  return (
    <View style={styles.person}>
      <View style={styles.personRow}>
        <GestureDetector gesture={gesture}>
        <View style={styles.slider} onLayout={onLayout}>
          <Animated.View style={[styles.panel, { transform: [{ translateX: nameX }] }]} pointerEvents={open ? 'none' : 'auto'} accessibilityElementsHidden={open} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}>
            <View style={[styles.slotLeft, styles.nameBox, { backgroundColor: colors.bg, borderColor: colors.line }]}>
              <AppText weight={isMe ? 'bold' : 'semibold'} color={isMe || row.name ? colors.ink : colors.muted} style={styles.nameText} numberOfLines={1}>
                {name}
              </AppText>
            </View>
            <View style={styles.slotRight}>
              <MoneyTextInput
                value={parseVndInput(row.paidText)}
                onChangeValue={(vnd) => onChange((r) => ({ ...r, paidText: formatVndInput(vnd) }))}
                placeholder="0"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Số tiền đã chi"
                style={[inputStyle, styles.paidInput]}
              />
              <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                ₫
              </AppText>
            </View>
          </Animated.View>
          <Animated.View style={[styles.panel, { transform: [{ translateX: slideInX }] }]} pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
            <View style={styles.slotLeft}>
              <TextInput
                value={row.weightText}
                onChangeText={(text) => onChange((r) => withWeightText(r, text))}
                keyboardType="decimal-pad"
                placeholder="Hệ số"
                placeholderTextColor={colors.muted}
                maxLength={4}
                accessibilityLabel="Hệ số chia"
                style={[inputStyle, styles.weightInput]}
              />
            </View>
            <AppText color={colors.muted} style={styles.orText}>
              hoặc
            </AppText>
            <View style={styles.slotRight}>
              <MoneyTextInput
                value={parseVndInput(row.fixedText)}
                onChangeValue={(vnd) => onChange((r) => withFixedText(r, formatVndInput(vnd)))}
                placeholder="Số tiền cố định"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Số tiền cố định"
                style={[inputStyle, styles.fixedInput, !row.fixedText && styles.fixedEmpty]}
              />
              {!!row.fixedText && (
                <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                  ₫
                </AppText>
              )}
            </View>
          </Animated.View>
        </View>
        </GestureDetector>
        {/* Không còn nút "⋯": chuyển lớp bằng cách vuốt ngang; chỉ khi đang ở lớp Hệ số mới có nút × để quay lại (ngoài cách vuốt phải). */}
        <View style={styles.moreButton}>
          {open && (
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng hệ số" onPress={() => onOpen(false)} hitSlop={6} style={styles.moreButton}>
              <AppText weight="bold" color={colors.muted} style={styles.closeX}>
                ×
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
      {!!caption && (
        <AppText weight="semibold" color={colors.primary} style={styles.caption}>
          {caption}
        </AppText>
      )}
    </View>
  );
}

// Số đo theo CSS `.mod-c` của PWA: thẻ bo 16 đệm 14; ô nhập cao 46 bo 12; nút bộ đếm tròn 36; tên chiếm ~25% dòng;
// ô tiền hiện hậu tố ".000 ₫" 13px màu phụ; chú thích hệ số 12/600 màu chủ đạo.
const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 4, gap: 12 },
  card: { borderRadius: AppRadius.card, padding: 14, gap: 10 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  categoryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingRight: 12, borderWidth: 1, borderRadius: 12 },
  categoryName: { flex: 1, fontSize: 16 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberButton: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 },
  memberText: { fontSize: 14 },
  saveButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { fontSize: 16 },
  ghostButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 14.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
  stepperLabel: { flex: 1, fontSize: 14 },
  stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, lineHeight: 24 },
  count: { minWidth: 64, textAlign: 'center', fontSize: 16 },
  countUnit: { fontSize: 13 },
  hint: { fontSize: 12.5, textAlign: 'center' },
  person: { gap: 2 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** Khung cắt cao cố định 46: hai lớp ô trượt trong khung nên chiều cao dòng không đổi. */
  // `touchAction: 'pan-y'` (web): vuốt ngang được giao cho ô trượt, trình duyệt chỉ tự cuộn khi vuốt dọc.
  slider: { flex: 1, minWidth: 0, height: 46, overflow: 'hidden', touchAction: 'pan-y' },
  panel: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotLeft: { flexBasis: '30%', maxWidth: '30%', height: 46, justifyContent: 'center' },
  slotRight: { flex: 1, minWidth: 0, height: 46, justifyContent: 'center' },
  nameBox: { paddingHorizontal: 10, borderWidth: 1, borderRadius: 12 },
  nameText: { fontSize: 15 },
  moneyInput: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, fontSize: 17 },
  paidInput: { paddingRight: 56, textAlign: 'right' },
  suffix: { position: 'absolute', right: 10, fontSize: 13 },
  weightInput: { textAlign: 'center', paddingHorizontal: 4, fontSize: 15 },
  orText: { fontSize: 13 },
  /** Ô còn trống chưa có hậu tố "₫" nên không chừa chỗ cho nó (để chữ gợi ý hiện đủ). */
  fixedEmpty: { paddingRight: 10 },
  fixedInput: { textAlign: 'right', paddingRight: 58, fontSize: 15 },
  closeX: { fontSize: 20, paddingHorizontal: 2 },
  moreButton: { width: 28, height: 46, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20 },
  caption: { fontSize: 12, paddingLeft: 2 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  sheetTitle: { fontSize: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '23.5%', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderWidth: 1, borderRadius: 12 },
  gridName: { fontSize: 12.5 },
});
