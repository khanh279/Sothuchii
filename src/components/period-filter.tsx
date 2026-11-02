import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { PrimaryButton, SecondaryButton, SegmentedControl } from '@/components/design';
import { SheetFrame } from '@/components/sheet-frame';
import { SvgIcon } from '@/components/svg-icon';
import { canGoNext, initialPeriodView, normalizeCustomRange, periodOf, periodTitle, type PeriodView } from '@/domain/expenses';
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

/**
 * Ghi chú kỳ BẤM ĐƯỢC (dưới tiêu đề của thẻ ở các trang lịch sử): hiện kỳ đang xem ("Tháng 10/2026", "01/09/2026 – 27/10/2026", "Tất cả") kèm mũi tên nhỏ; bấm vào mở đúng bảng chọn thời gian của
 * `PeriodFilter` (cùng giao diện, cùng quy tắc, và ghi vào cùng kỳ dùng chung của cả ứng dụng qua `onChange`). Thay cho ô chọn kỳ ở góc phải tiêu đề.
 */
export function PeriodNote({ view, onChange, today, color }: { view: PeriodView; onChange: (view: PeriodView) => void; today: DateStr; /** Màu chữ và mũi tên (mặc định xám); đổi khi đặt trên nền tối. */ color?: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const period = periodOf(view);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Bộ lọc thời gian: ${periodHeading(period)}, ${periodRangeLabel(period)}`}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.noteBtn, { opacity: pressed ? 0.7 : 1 }]}>
        <AppText color={color ?? colors.muted} style={styles.noteText} numberOfLines={1}>
          {periodTitle(period)}
        </AppText>
        <View style={styles.noteArrow}>
          <SvgIcon name="chevronRight" size={12} color={color ?? colors.muted} strokeWidth={2.4} />
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
  return (
    <SheetFrame onClose={onClose}>
      <PeriodBody initial={initial} today={today} onApply={onApply} />
    </SheetFrame>
  );
}

function PeriodBody({ initial, today, onApply }: { initial: PeriodView; today: DateStr; onApply: (view: PeriodView) => void }) {
  const colors = useColors();
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
    <>
      <View style={styles.sheet}>
          <View style={styles.head}>
            <AppText weight="bold" style={styles.title} accessibilityRole="header">
              Chọn thời gian
            </AppText>
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

      {picking && (
        <CalendarPanel
          variant="popup"
          value={picking === 'from' ? draft.from : draft.to}
          today={today}
          // Ngày bắt đầu: tối đa là ngày kết thúc đang chọn. Ngày kết thúc: tối thiểu là ngày bắt đầu, tối đa là hôm nay. Ngày ngoài khoảng bị mờ và không chọn được.
          min={picking === 'to' ? draft.from : undefined}
          max={picking === 'from' && draft.to < today ? draft.to : today}
          onCancel={() => setPicking(null)}
          onConfirm={(date) => {
            setPicking(null);
            if (picking === 'from') applyRange(date, draft.to);
            else applyRange(draft.from, date);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  noteBtn: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteText: { flexShrink: 1, fontSize: 12.5, lineHeight: 17 },
  noteArrow: { transform: [{ rotate: '90deg' }] },
  range: { fontSize: 12.5, lineHeight: 17 },
  sheet: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, lineHeight: 26 },
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
