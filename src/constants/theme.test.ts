import { AppFonts, fontKeyForWeight } from './fonts';
import { PwaColors, SoTienColors } from './palette';

const COLOR = /^(#[0-9A-Fa-f]{6}|rgba\(\d{1,3},\d{1,3},\d{1,3},\d?\.?\d+\))$/;

describe('bộ màu PWA', () => {
  it('sáng và tối có cùng danh sách khóa', () => {
    expect(Object.keys(SoTienColors.dark).sort()).toEqual(Object.keys(SoTienColors.light).sort());
  });

  it('mọi giá trị là mã màu hợp lệ', () => {
    for (const palette of [SoTienColors.light, SoTienColors.dark]) {
      for (const [key, value] of Object.entries(palette)) {
        expect({ key, ok: COLOR.test(value) }).toEqual({ key, ok: true });
      }
    }
  });

  it('khớp các giá trị đo được từ PWA (--st-*)', () => {
    expect(SoTienColors.light).toMatchObject({ bg: '#F0F2F5', surface: '#FFFFFF', ink: '#1C1E21', primary: '#1877F2', line: '#DADDE1', danger: '#C9302C' });
    expect(SoTienColors.dark).toMatchObject({ bg: '#18191A', surface: '#242526', ink: '#E4E6EB', primary: '#2D88FF', line: '#3E4042', danger: '#F0807A' });
  });

  it('PwaColors là bộ màu sáng', () => {
    expect(PwaColors).toBe(SoTienColors.light);
  });
});

describe('font', () => {
  it('fontKeyForWeight chọn font gần nhất, 800 dùng 700 như trình duyệt', () => {
    expect(fontKeyForWeight(400)).toBe('regular');
    expect(fontKeyForWeight('500')).toBe('medium');
    expect(fontKeyForWeight(600)).toBe('semibold');
    expect(fontKeyForWeight(700)).toBe('bold');
    expect(fontKeyForWeight(800)).toBe('bold');
    expect(fontKeyForWeight(300)).toBe('regular');
  });

  it('tên font đúng dạng của gói @expo-google-fonts', () => {
    for (const name of Object.values(AppFonts)) expect(name).toMatch(/^[A-Za-z]+_\d{3}[A-Za-z]+$/);
  });
});
