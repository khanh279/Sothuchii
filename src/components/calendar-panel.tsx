import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { buildCalendarMonth, openCalendar, WEEKDAY_HEADERS } from '@/domain/calendar';
import { useColors } from '@/hooks/use-colors';
import type { DateStr } from '@/types/expense';
import { addMonths } from '@/utils/date';
import { withAlpha } from '@/utils/color';

interface Props {
  /** Ngày đang có trong ô; lịch mở ở tháng của ngày này. */
  value: DateStr;
  today: DateStr;
  min?: DateStr;
  max?: DateStr;
  /**
   * 'overlay': phủ kín khung cha (khung cha phải `position: relative`), dùng trong form nhập.
   * 'popup': nổi giữa màn hình trên lớp mờ, dùng cho ô nằm trong khung nhỏ (ô chọn kỳ).
   */
  variant: 'overlay' | 'popup';
  onCancel: () => void;
  onConfirm: (date: DateStr) => void;
}

/**
 * Lịch chọn ngày tự dựng của PWA (`.calp`): tiêu đề "Chọn ngày", điều hướng tháng, hàng T2…CN,
 * lưới ngày, hai nút Huỷ / OK. Chọn ngày chỉ có hiệu lực khi bấm OK.
 */
export function CalendarPanel({ value, today, min, max, variant, onCancel, onConfirm }: Props) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [state, setState] = useState(() => openCalendar(value, today, { min, max }));
  const { selected, month } = state;
  const view = buildCalendarMonth(month, { selected, today, min, max });

  const panel = (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.surface },
        variant === 'overlay'
          ? styles.overlay
          : [styles.popup, { width: Math.min(380, width - 32), borderColor: colors.line }],
      ]}
      accessibilityViewIsModal>
      <AppText weight="bold" style={styles.title}>
        Chọn ngày
      </AppText>

      <View style={styles.monthRow}>
        <Pressable
          style={[styles.navButton, { backgroundColor: colors.bg }, view.prevDisabled && styles.dim]}
          accessibilityLabel="Tháng trước"
          disabled={view.prevDisabled}
          onPress={() => setState((s) => ({ ...s, month: addMonths(s.month, -1) }))}>
          <SvgIcon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2.2} />
        </Pressable>
        <AppText weight="bold" style={styles.monthTitle}>
          {view.title}
        </AppText>
        <Pressable
          style={[styles.navButton, { backgroundColor: colors.bg }, view.nextDisabled && styles.dim]}
          accessibilityLabel="Tháng sau"
          disabled={view.nextDisabled}
          onPress={() => setState((s) => ({ ...s, month: addMonths(s.month, 1) }))}>
          <SvgIcon name="chevronRight" size={20} color={colors.ink} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAY_HEADERS.map((name) => (
          <AppText key={name} weight="semibold" color={colors.muted} style={styles.weekday}>
            {name}
          </AppText>
        ))}
      </View>

      <View style={styles.grid}>
        {view.weeks.map((week, row) => (
          <View key={row} style={styles.week}>
            {week.map((cell, col) =>
              cell ? (
                <Pressable
                  key={cell.date}
                  style={[styles.day, cell.selected && { backgroundColor: colors.primary }, cell.disabled && styles.disabled]}
                  disabled={cell.disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: cell.selected, disabled: cell.disabled }}
                  accessibilityLabel={`Ngày ${cell.day}`}
                  onPress={() => setState((s) => ({ ...s, selected: cell.date }))}>
                  <AppText
                    weight={cell.selected || cell.today ? 'bold' : 'medium'}
                    color={cell.selected ? colors.primaryInk : cell.today ? colors.primary : colors.ink}
                    style={styles.dayText}>
                    {cell.day}
                  </AppText>
                </Pressable>
              ) : (
                <View key={`blank-${col}`} style={styles.day} />
              ),
            )}
          </View>
        ))}
      </View>

      <View style={[styles.footer, variant === 'popup' && styles.footerPopup]}>
        <Pressable style={[styles.button, { backgroundColor: colors.bg, borderColor: colors.line, borderWidth: 1 }]} accessibilityRole="button" onPress={onCancel}>
          <AppText weight="bold" style={styles.buttonText}>
            Huỷ
          </AppText>
        </Pressable>
        <Pressable
          style={[styles.button, styles.ok, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
          accessibilityRole="button"
          onPress={() => onConfirm(selected)}>
          <AppText weight="bold" color={colors.primaryInk} style={styles.buttonText}>
            OK
          </AppText>
        </Pressable>
      </View>
    </View>
  );

  if (variant === 'overlay') return panel;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <Pressable style={[styles.scrim, { backgroundColor: withAlpha('#000000', 0.3) }]} onPress={onCancel} accessibilityLabel="Đóng lịch">
        {/* Chặn chạm xuyên xuống lớp mờ khi bấm vào chính lịch. */}
        <Pressable onPress={() => undefined}>{panel}</Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 8, borderRadius: 21 },
  /** Phủ kín khung form: lệch 4px mỗi cạnh như đo từ PWA. */
  overlay: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, zIndex: 6 },
  popup: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, lineHeight: 26, paddingHorizontal: 2, paddingTop: 2 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  navButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.35 },
  monthTitle: { fontSize: 16 },
  week: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 17 },
  grid: { gap: 4 },
  day: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15.5, fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.3 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 'auto', paddingTop: 4 },
  footerPopup: { marginTop: 8 },
  button: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ok: { shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  buttonText: { fontSize: 16 },
});
