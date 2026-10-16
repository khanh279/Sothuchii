import { AppFonts, fontKeyForWeight } from './fonts';
import { PwaColors, SoTienColors } from './palette';

const COLOR = /^(#[0-9A-Fa-f]{6}|rgba\(\d{1,3},\d{1,3},\d{1,3},\d?\.?\d+\))$/;

describe('bộ màu Minimal Finance', () => {
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

  it('màu chủ đạo là navy, nền trắng / xám nhạt, tiền nhận xanh lá, tiền trả đỏ', () => {
    expect(SoTienColors.light).toMatchObject({ bg: '#F5F7FA', surface: '#FFFFFF', primary: '#0B2A4A', heroBg: '#0B2A4A', success: '#0F8A4B', danger: '#D64545', accent: '#0E8F9B' });
    expect(SoTienColors.dark).toMatchObject({ bg: '#0A1220', surface: '#121C2E', primary: '#4F83E8', success: '#4CC38A', danger: '#F08A84' });
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
