/**
 * Logic của lịch chọn ngày (chuyển từ `SoTienCal` của PWA): lưới tuần bắt đầu từ THỨ HAI,
 * ngày ngoài [min, max] bị mờ và không chọn được, nút tháng trước/sau bị khoá ở biên.
 * Ngày là chuỗi 'YYYY-MM-DD' theo giờ máy; không dùng toISOString().
 */

import { monthHeading } from '@/domain/expenses';
import type { DateStr, MonthKey } from '@/types/expense';
import { addMonths, daysInMonth, isValidDateStr, monthOf } from '@/utils/date';

export const WEEKDAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export interface CalendarLimits {
  /** Ngày sớm nhất được chọn (tuỳ chọn). */
  min?: DateStr;
  /** Ngày muộn nhất được chọn (tuỳ chọn), thường là hôm nay. */
  max?: DateStr;
}

export interface CalendarCell {
  date: DateStr;
  day: number;
  disabled: boolean;
  selected: boolean;
  today: boolean;
}

export interface CalendarMonth {
  month: MonthKey;
  /** "Tháng 10, 2026". */
  title: string;
  /** Các tuần (7 ô mỗi hàng); ô trống là null. */
  weeks: (CalendarCell | null)[][];
  prevDisabled: boolean;
  nextDisabled: boolean;
}

/** Kéo ngày về trong [min, max]. Ngày không hợp lệ được coi là `fallback`. */
export function clampDate(date: DateStr, limits: CalendarLimits, fallback: DateStr): DateStr {
  let result = isValidDateStr(date) ? date : fallback;
  if (limits.max && result > limits.max) result = limits.max;
  if (limits.min && result < limits.min) result = limits.min;
  return result;
}

/** Ngày đang chọn khi mở lịch và tháng hiển thị tương ứng. */
export function openCalendar(value: DateStr, today: DateStr, limits: CalendarLimits): { selected: DateStr; month: MonthKey } {
  const selected = clampDate(value, limits, today);
  return { selected, month: monthOf(selected) };
}

/** Thứ trong tuần tính từ thứ Hai = 0 … Chủ nhật = 6. */
function mondayIndex(date: DateStr): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export function buildCalendarMonth(
  month: MonthKey,
  options: { selected: DateStr; today: DateStr } & CalendarLimits,
): CalendarMonth {
  const { selected, today, min, max } = options;
  const lead = mondayIndex(`${month}-01`);
  const cells: (CalendarCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth(month); day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({
      date,
      day,
      disabled: (!!max && date > max) || (!!min && date < min),
      selected: date === selected,
      today: date === today,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    month,
    title: monthHeading(month),
    weeks,
    prevDisabled: !!min && addMonths(month, -1) < monthOf(min),
    nextDisabled: !!max && addMonths(month, 1) > monthOf(max),
  };
}
