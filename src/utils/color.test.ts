import { withAlpha } from './color';

describe('withAlpha', () => {
  it('đổi hex sang rgba', () => {
    expect(withAlpha('#FFFFFF', 0.94)).toBe('rgba(255,255,255,0.94)');
    expect(withAlpha('#1877f2', 0.5)).toBe('rgba(24,119,242,0.5)');
  });

  it('giới hạn độ mờ trong 0–1', () => {
    expect(withAlpha('#000000', 2)).toBe('rgba(0,0,0,1)');
    expect(withAlpha('#000000', -1)).toBe('rgba(0,0,0,0)');
  });

  it('mã không hợp lệ giữ nguyên', () => {
    expect(withAlpha('red', 0.5)).toBe('red');
    expect(withAlpha('#FFF', 0.5)).toBe('#FFF');
  });
});
