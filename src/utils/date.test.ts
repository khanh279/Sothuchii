import {
  addDays,
  addMonths,
  daysInMonth,
  daysInclusive,
  formatDateStr,
  formatVnDate,
  isValidDateStr,
  isValidMonthKey,
  maskVnDateInput,
  monthsBetween,
  parseVnDate,
  todayStr,
  weekdayName,
} from './date';

describe('date', () => {
  it('formatDateStr dùng giờ máy, không lệch múi giờ', () => {
    // 00:30 sáng ngày 1/10 giờ máy vẫn phải là 2025-10-01 (toISOString có thể ra 30/09 ở múi giờ +7)
    expect(formatDateStr(new Date(2025, 9, 1, 0, 30))).toBe('2025-10-01');
    expect(formatDateStr(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31');
    expect(todayStr(new Date(2024, 1, 29, 12))).toBe('2024-02-29');
  });

  it('daysInMonth xử lý năm nhuận', () => {
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2025-02')).toBe(28);
    expect(daysInMonth('2025-10')).toBe(31);
    expect(daysInMonth('2025-11')).toBe(30);
  });

  it('addMonths qua đầu năm / cuối năm', () => {
    expect(addMonths('2025-01', -1)).toBe('2024-12');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(addMonths('2025-10', 0)).toBe('2025-10');
    expect(addMonths('2025-10', 15)).toBe('2027-01');
  });

  it('addDays và daysInclusive', () => {
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(daysInclusive('2025-10-08', '2025-10-08')).toBe(1);
    expect(daysInclusive('2025-10-01', '2025-10-31')).toBe(31);
    // qua ngày chuyển giờ mùa hè vẫn đúng số ngày
    expect(daysInclusive('2025-03-01', '2025-04-01')).toBe(32);
  });

  it('monthsBetween có giới hạn', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2025-05', '2025-05')).toEqual(['2025-05']);
    expect(monthsBetween('2025-06', '2025-05')).toEqual([]);
    expect(monthsBetween('2000-01', '2025-12', 62)).toHaveLength(62);
  });

  it('kiểm tra chuỗi ngày / tháng', () => {
    expect(isValidDateStr('2025-02-28')).toBe(true);
    expect(isValidDateStr('2024-02-29')).toBe(true);
    expect(isValidDateStr('2025-02-29')).toBe(false);
    expect(isValidDateStr('2025-13-01')).toBe(false);
    expect(isValidDateStr('2025-1-1')).toBe(false);
    expect(isValidDateStr('')).toBe(false);
    expect(isValidMonthKey('2025-10')).toBe(true);
    expect(isValidMonthKey('2025-00')).toBe(false);
    expect(isValidMonthKey('2025-1')).toBe(false);
  });

  it('parseVnDate nhận dd/mm/yyyy hợp lệ, từ chối ngày không có thật', () => {
    expect(parseVnDate('08/10/2025')).toBe('2025-10-08');
    expect(parseVnDate('8/1/2025')).toBe('2025-01-08');
    expect(parseVnDate(' 29/02/2024 ')).toBe('2024-02-29');
    expect(parseVnDate('29/02/2025')).toBe('');
    expect(parseVnDate('31/04/2025')).toBe('');
    expect(parseVnDate('2025-10-08')).toBe('');
    expect(parseVnDate('')).toBe('');
    expect(parseVnDate('ab/cd/efgh')).toBe('');
  });

  it('maskVnDateInput tự chèn dấu gạch chéo', () => {
    expect(maskVnDateInput('')).toBe('');
    expect(maskVnDateInput('0')).toBe('0');
    expect(maskVnDateInput('081')).toBe('08/1');
    expect(maskVnDateInput('08102')).toBe('08/10/2');
    expect(maskVnDateInput('08102025999')).toBe('08/10/2025');
    expect(maskVnDateInput('08/10/2025')).toBe('08/10/2025');
  });

  it('định dạng hiển thị', () => {
    expect(formatVnDate('2025-10-08')).toBe('08/10/2025');
    expect(weekdayName('2025-10-08')).toBe('Thứ tư');
    expect(weekdayName('2025-10-05')).toBe('Chủ nhật');
  });
});
