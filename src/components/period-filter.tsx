import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { PrimaryButton, SecondaryButton, SegmentedControl } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { canGoNext, initialPeriodView, normalizeCustomRange, periodOf, type PeriodView } from '@/domain/expenses';
import { periodHeading, periodRangeLabel } from '@/domain/periodFilter';
import { useColors } from '@/hooks/use-colors';
import type { DateStr, Period } from '@/types/expense';
import { addMonths, isValidDateStr } from '@/utils/date';

const MODES: { value: Period['mode']; label: string }[] = [
  { value: 'month', label: 'Tháng' },
  { value: 'year', label: 'Năm' },
  { value: 'all', label: 'Tất cả' },
  { value: 'custom', label: 'Tuỳ chọn' },
];

interface Props {
  view: PeriodView;
  onChange: (view: PeriodView) => void;
  today: DateStr;
}

/**
 * Bộ lọc thời gian dùng chung: mặc định là MỘT dòng thu gọn (biểu tượng lịch, tên kỳ, khoảng ngày, mũi tên xuống). Bấm vào mở bảng chọn
 * (Tháng / Năm / Tất cả / Tuỳ chọn). Lựa chọn nằm trong bản nháp của bảng; chỉ khi bấm "Áp dụng" mới gọi `onChange` một lần, nên danh sách
 * không bị tải lại giữa chừng. "Đặt lại" đưa bản nháp về mặc định của các màn dùng bộ lọc này (`initialPeriodView`: tháng hiện tại).
 * Component chỉ chọn kỳ; việc lọc dữ liệu do màn hình dùng `periodOf(view)` như trước. Quy tắc cũ được giữ: không tới kỳ tương lai
 * (`canGoNext`), khoảng Tuỳ chọn không quá hôm nay, ngày bắt đầu không sau ngày kết thúc và tối đa 5 năm (`normalizeCustomRange`).
 */
export function PeriodFilter({ view, onChange, today }: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const period = periodOf(view);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Bộ lọc thời gian: ${periodHeading(period)}, ${periodRangeLabel(period)}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: open ? colors.primary : colors.line, opacity: pressed ? 0.85 : 1 }]}>
        <SvgIcon name="calendar" size={20} color={colors.primary} strokeWidth={1.9} />
        <View style={styles.rowText}>
          <AppText weight="semibold" style={styles.heading} numberOfLines={1}>
            {periodHeading(period)}
          </AppText>
          <AppText color={colors.muted} style={styles.range} numberOfLines={1}>
            {periodRangeLabel(period)}
          </AppText>
        </View>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <SvgIcon name="chevronRight" size={18} color={colors.muted} strokeWidth={2.2} />
        </View>
      </Pressable>

      {open && (
        <PeriodSheet
          initial={view}
          today={today}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            setOpen(false);
            onChange(next);
          }}
        />
      )}
    </>
  );
}

function PeriodSheet({ initial, today, onClose, onApply }: { initial: PeriodView; today: DateStr; onClose: () => void; onApply: (view: PeriodView) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<PeriodView>(initial);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const period = periodOf(draft);
  const next = canGoNext(period, today);

  function shift(delta: number) {
    if (draft.mode === 'month') setDraft({ ...draft, month: addMonths(draft.month, delta) });
    else if (draft.mode === 'year') setDraft({ ...draft, year: draft.year + delta });
  }

  function applyRange(from: DateStr, to: DateStr) {
    if (!isValidDateStr(from) || !isValidDateStr(to)) return;
    const range = normalizeCustomRange(from, to, today);
    setDraft({ ...draft, from: range.from, to: range.to });
    setNote(range.clamped ? 'Xem tối đa 5 năm một lần' : null);
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modal}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityLabel="Đóng bảng chọn thời gian" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
          <View style={[styles.handle, { backgroundColor: colors.line }]} />
          <View style={styles.head}>
            <AppText weight="bold" style={styles.title} accessibilityRole="header">
              Chọn thời gian
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={10} onPress={onClose} style={[styles.close, { backgroundColor: colors.surface2 }]}>
              <SvgIcon name="close" size={16} color={colors.muted} strokeWidth={2.4} />
            </Pressable>
          </View>

          <SegmentedControl
            options={MODES}
            value={draft.mode}
            onChange={(mode) => {
              setNote(null);
              setDraft({ ...draft, mode });
            }}
          />

          <View style={styles.body}>
            {(draft.mode === 'month' || draft.mode === 'year') && (
              <View style={styles.stepper}>
                <Pressable style={[styles.arrow, { backgroundColor: colors.bg }]} accessibilityLabel="Kỳ trước" onPress={() => shift(-1)}>
                  <SvgIcon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.stepperText}>
                  <AppText weight="bold" style={styles.bigHeading}>
                    {periodHeading(period)}
                  </AppText>
                  <AppText color={colors.muted} style={styles.range}>
                    {periodRangeLabel(period)}
                  </AppText>
                </View>
                <Pressable style={[styles.arrow, { backgroundColor: colors.bg }, !next && styles.off]} accessibilityLabel="Kỳ sau" disabled={!next} onPress={() => shift(1)}>
                  <SvgIcon name="chevronRight" size={20} color={colors.ink} strokeWidth={2.2} />
                </Pressable>
              </View>
            )}

            {draft.mode === 'all' && (
              <View style={styles.center}>
                <AppText weight="bold" style={styles.bigHeading}>
                  Tất cả thời gian
                </AppText>
                <AppText color={colors.muted} style={styles.range}>
                  Xem toàn bộ dữ liệu, không giới hạn ngày
                </AppText>
              </View>
            )}

            {draft.mode === 'custom' && (
              <View style={styles.rangeRow}>
                <View style={styles.rangeCol}>
                  <AppText weight="medium" color={colors.muted} style={styles.fieldLabel}>
                    Từ ngày
                  </AppText>
                  <DateField value={draft.from} accessibilityLabel="Từ ngày" onPress={() => setPicking('from')} />
                </View>
                <View style={styles.rangeCol}>
                  <AppText weight="medium" color={colors.muted} style={styles.fieldLabel}>
                    Đến ngày
                  </AppText>
                  <DateField value={draft.to} accessibilityLabel="Đến ngày" onPress={() => setPicking('to')} />
                </View>
              </View>
            )}

            {!!note && (
              <AppText color={colors.danger} style={styles.note}>
                {note}
              </AppText>
            )}
          </View>

          <View style={styles.actions}>
            <SecondaryButton
              label="Đặt lại"
              style={styles.action}
              onPress={() => {
                setNote(null);
                setDraft(initialPeriodView(today));
              }}
            />
            <PrimaryButton label="Áp dụng" style={styles.action} onPress={() => onApply(draft)} />
          </View>
        </View>
      </View>

      {picking && (
        <CalendarPanel
          variant="popup"
          value={picking === 'from' ? draft.from : draft.to}
          today={today}
          max={today}
          onCancel={() => setPicking(null)}
          onConfirm={(date) => {
            setPicking(null);
            if (picking === 'from') applyRange(date, draft.to);
            else applyRange(draft.from, date);
          }}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, borderRadius: AppRadius.card, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  heading: { fontSize: 15, lineHeight: 20 },
  range: { fontSize: 12.5, lineHeight: 17 },
  modal: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: AppRadius.hero, borderTopRightRadius: AppRadius.hero, paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, lineHeight: 26 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body: { minHeight: 92, justifyContent: 'center', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperText: { flex: 1, alignItems: 'center' },
  bigHeading: { fontSize: 18, lineHeight: 26, textAlign: 'center' },
  arrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.3 },
  center: { alignItems: 'center', gap: 2 },
  rangeRow: { flexDirection: 'row', gap: 12 },
  rangeCol: { flex: 1, gap: 6 },
  fieldLabel: { fontSize: 12.5 },
  note: { fontSize: 13, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
