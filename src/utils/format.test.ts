import { formatGrouped, formatVnd, formatVndCompact } from './format';

describe('format', () => {
  it('formatGrouped không kèm ký hiệu tiền', () => {
    expect(formatGrouped(0)).toBe('0');
    expect(formatGrouped(999)).toBe('999');
    expect(formatGrouped(1000)).toBe('1.000');
    expect(formatGrouped(999999999999)).toBe('999.999.999.999');
    expect(formatGrouped(NaN)).toBe('0');
  });

  it('formatVnd có dấu chấm hàng nghìn', () => {
    expect(formatVnd(0)).toBe('0 ₫');
    expect(formatVnd(1234567)).toBe('1.234.567 ₫');
    expect(formatVnd(-50000)).toBe('-50.000 ₫');
  });

  it('formatVndCompact rút gọn k / tr / tỷ', () => {
    expect(formatVndCompact(500)).toBe('500');
    expect(formatVndCompact(1500)).toBe('1,5k');
    expect(formatVndCompact(50000)).toBe('50k');
    expect(formatVndCompact(2500000)).toBe('2,5tr');
    expect(formatVndCompact(3000000000)).toBe('3 tỷ');
  });
});
