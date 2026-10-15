import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { CategoryIcon } from '@/components/category-icon';
import { DateField } from '@/components/date-field';
import { SvgIcon } from '@/components/svg-icon';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { loadBillNames } from '@/data/billRepository';
import { loadPeople } from '@/data/peopleRepository';
import { MAX_BILL_PEOPLE, MIN_BILL_PEOPLE, computeSplit, defaultPersonName, describeSplitProblem } from '@/domain/bills';
import {
  emptyPerson,
  formatMoney,
  formatPaidText,
  initialPeople,
  maskPaidInput,
  resizePeople,
  rowMeta,
  rowStatus,
  toSplitPeople,
  weightCaption,
  withFixedText,
  withWeightText,
  type FormPerson,
} from '@/domain/billForm';
import { allCategories } from '@/domain/expenses';
import { swipeToggle } from '@/domain/swipe';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { DateStr } from '@/types/expense';
import { withAlpha } from '@/utils/color';
import { todayStr } from '@/utils/date';

/** Màu nhận lại / còn thiếu (`--in`, `--out` của PWA). */
const GET_COLOR = '#0F8A4B';
const OWE_COLOR = '#D64545';
/** Các mục chi của bill và thứ tự hiển thị, như PWA (`ne`). */
const BILL_CATEGORY_IDS = ['food', 'fun', 'trip', 'move', 'bill', 'other'];

/**
 * Màn tính chia bill (phần "Chia bill" của tab Giao dịch): nội dung, mục chi, ngày, số người 2–20, số tiền mỗi
 * người đã chi (NGHÌN đồng) và kết quả chia theo thời gian thực. Vuốt ô tiền sang trái để đặt hệ số hoặc mức
 * cố định. Lưu bill và chọn người từ danh sách thuộc bước 4D.
 */
export default function BillCalcScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = todayStr();
  const { settings } = useExpenseSettings();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState<DateStr>(today);
  const [catId, setCatId] = useState('food');
  const [rows, setRows] = useState<FormPerson[]>([emptyPerson('Tôi')]);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickingCategory, setPickingCategory] = useState(false);
  const touched = useRef(false);

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
  const setCount = (count: number) => {
    setOpenRow(null);
    update(resizePeople(rows, count));
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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
        <DateField value={date} onPress={() => setCalendarOpen(true)} />

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

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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

      {split.total > 0 && (split.bad ? (
        <View style={[styles.warn, { backgroundColor: colors.dangerSoft }]} accessibilityRole="alert">
          <AppText weight="semibold" color={colors.danger} style={styles.warnText}>
            {describeSplitProblem(split)}
          </AppText>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.totRow}>
            <View style={styles.totCell}>
              <AppText weight="semibold" color={colors.muted} style={styles.lbl}>
                Tổng bill
              </AppText>
              <AppText weight="display" style={styles.total} numberOfLines={1}>
                {formatMoney(split.total)}
              </AppText>
            </View>
            <View style={[styles.totCell, styles.totRight]}>
              <AppText weight="semibold" color={colors.muted} style={styles.lbl}>
                {split.even ? 'Mỗi người' : 'Mỗi phần'}
              </AppText>
              <AppText weight="display" style={styles.each} numberOfLines={1}>
                {formatMoney(split.share)}
              </AppText>
            </View>
          </View>
          <View style={[styles.dash, { borderTopColor: colors.line }]} />
          {split.rows.map((row) => {
            const status = rowStatus(row);
            return (
              <View key={row.index} style={styles.resultLine}>
                <View style={styles.resultMain}>
                  <AppText weight="semibold" style={styles.who} numberOfLines={1}>
                    {row.name}
                  </AppText>
                  <AppText color={colors.muted} style={styles.meta}>
                    {rowMeta(row)}
                  </AppText>
                </View>
                {status.kind === 'even' ? (
                  <AppText weight="semibold" color={colors.muted} style={styles.statusText}>
                    Đã đủ
                  </AppText>
                ) : (
                  <View style={styles.statusCol}>
                    <AppText color={colors.muted} style={styles.statusLabel}>
                      {status.kind === 'get' ? 'Nhận lại' : 'Còn thiếu'}
                    </AppText>
                    <AppText weight="bold" color={status.kind === 'get' ? GET_COLOR : OWE_COLOR} style={styles.statusAmount}>
                      {status.kind === 'get' ? '+' : '−'}
                      {formatMoney(status.amount / 1e3)}
                    </AppText>
                  </View>
                )}
              </View>
            );
          })}
          {split.transfers.length > 0 && (
            <>
              <View style={[styles.dash, { borderTopColor: colors.line }]} />
              <AppText weight="semibold" color={colors.muted} style={styles.lbl}>
                Cần chuyển
              </AppText>
              {split.transfers.map((transfer, index) => (
                <View key={index} style={styles.transfer}>
                  <AppText weight="semibold" style={styles.transferWho} numberOfLines={1}>
                    {transfer.from} → {transfer.to}
                  </AppText>
                  <AppText weight="bold" style={styles.statusAmount}>
                    {formatMoney(transfer.amt)}
                  </AppText>
                </View>
              ))}
            </>
          )}
        </View>
      ))}

      {pickingCategory && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setPickingCategory(false)}>
          <View style={[styles.scrim, { backgroundColor: withAlpha('#000000', 0.45) }]}>
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
    </ScrollView>
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
 * Một người: tên, ô số tiền đã chi và (khi vuốt sang trái) hai ô hệ số / mức cố định. Vuốt sang phải hoặc chạm
 * nút "×" để đóng. Tên mặc định theo thứ tự dòng hiển thị mờ; chọn người từ danh sách là bước 4D.
 */
function PersonRow({ index, row, open, caption, onOpen, onChange }: PersonRowProps) {
  const colors = useColors();
  // Vuốt ngang trên ô tiền: ghi điểm chạm đầu, khi nhấc tay mới quyết định (không giành quyền cuộn của danh sách).
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: GestureResponderEvent) => {
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
  };
  const onTouchEnd = (event: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const action = swipeToggle(event.nativeEvent.pageX - start.x, event.nativeEvent.pageY - start.y, open);
    if (action) onOpen(action === 'open');
  };

  const inputStyle = [styles.moneyInput, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }];
  const isMe = index === 0;
  const name = isMe ? 'Tôi' : row.name || defaultPersonName(index);

  return (
    <View style={styles.person}>
      <View style={styles.personRow}>
        <View style={[styles.nameBox, { backgroundColor: colors.bg, borderColor: colors.line }]}>
          <AppText weight={isMe ? 'bold' : 'semibold'} color={isMe || row.name ? colors.ink : colors.muted} style={styles.nameText} numberOfLines={1}>
            {name}
          </AppText>
        </View>
        <View style={styles.moneyArea} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {open ? (
            <View style={styles.overlay}>
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
              <AppText color={colors.muted} style={styles.or}>
                hoặc
              </AppText>
              <View style={styles.fixedWrap}>
                <TextInput
                  value={row.fixedText}
                  onChangeText={(text) => onChange((r) => withFixedText(r, text))}
                  keyboardType="decimal-pad"
                  placeholder="Số tiền cố định"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Số tiền cố định, nghìn đồng"
                  style={[inputStyle, styles.fixedInput]}
                />
                {!!row.fixedText && (
                  <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                    .000 ₫
                  </AppText>
                )}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Đóng hệ số" onPress={() => onOpen(false)} hitSlop={8}>
                <AppText weight="bold" color={colors.muted} style={styles.closeX}>
                  ×
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.paidWrap}>
              <TextInput
                value={formatPaidText(row.paidText)}
                onChangeText={(text) => onChange((r) => ({ ...r, paidText: maskPaidInput(text) }))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Số tiền đã chi, nghìn đồng"
                style={[inputStyle, styles.paidInput]}
              />
              <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                .000 ₫
              </AppText>
            </View>
          )}
        </View>
        {!open && (
          <Pressable accessibilityRole="button" accessibilityLabel="Hệ số hoặc số tiền cố định" onPress={() => onOpen(true)} hitSlop={6} style={styles.moreButton}>
            <AppText weight="bold" color={colors.muted} style={styles.moreText}>
              ⋯
            </AppText>
          </Pressable>
        )}
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
  card: { borderRadius: AppRadius.card, borderWidth: 1, padding: 14, gap: 10 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  categoryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingRight: 12, borderWidth: 1, borderRadius: 12 },
  categoryName: { flex: 1, fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
  stepperLabel: { flex: 1, fontSize: 14 },
  stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, lineHeight: 24 },
  count: { minWidth: 64, textAlign: 'center', fontSize: 16 },
  countUnit: { fontSize: 13 },
  hint: { fontSize: 12.5, textAlign: 'center' },
  person: { gap: 2 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameBox: { flexBasis: '27%', maxWidth: '27%', minHeight: 46, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderRadius: 12 },
  nameText: { fontSize: 15 },
  moneyArea: { flex: 1, minWidth: 0, minHeight: 46, justifyContent: 'center' },
  paidWrap: { justifyContent: 'center' },
  moneyInput: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, fontSize: 17 },
  paidInput: { paddingRight: 56, textAlign: 'right' },
  suffix: { position: 'absolute', right: 10, fontSize: 13 },
  overlay: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weightInput: { flexBasis: '28%', maxWidth: 96, textAlign: 'center', paddingHorizontal: 4, fontSize: 15 },
  or: { fontSize: 12.5 },
  fixedWrap: { flex: 1, minWidth: 0, justifyContent: 'center' },
  fixedInput: { textAlign: 'right', paddingRight: 58, fontSize: 15 },
  closeX: { fontSize: 20, paddingHorizontal: 2 },
  moreButton: { width: 28, height: 46, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20 },
  caption: { fontSize: 12, paddingLeft: 2 },
  warn: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  warnText: { fontSize: 14 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  totCell: { flexShrink: 1, minWidth: 0 },
  totRight: { alignItems: 'flex-end', flexShrink: 0 },
  lbl: { fontSize: 13 },
  total: { fontSize: 30 },
  each: { fontSize: 20 },
  dash: { borderTopWidth: 1, borderStyle: 'dashed' },
  resultLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resultMain: { flex: 1, minWidth: 0 },
  who: { fontSize: 15.5 },
  meta: { fontSize: 12.5, lineHeight: 17 },
  statusCol: { alignItems: 'flex-end' },
  statusLabel: { fontSize: 12 },
  statusAmount: { fontSize: 15.5 },
  statusText: { fontSize: 14 },
  transfer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  transferWho: { flex: 1, minWidth: 0, fontSize: 15 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  sheetTitle: { fontSize: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '23.5%', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderWidth: 1, borderRadius: 12 },
  gridName: { fontSize: 12.5 },
});
