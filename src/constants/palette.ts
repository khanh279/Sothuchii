/**
 * Bộ màu của PWA Sổ Thu Chi, lấy nguyên từ biến `--st-*` trong index.html
 * (sáng: khối `:root`; tối: `@media (prefers-color-scheme: dark)`).
 * Dùng `useColors()` để lấy bộ màu theo chế độ sáng/tối của thiết bị.
 */
export interface SoTienPalette {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  line: string;
  primary: string;
  primaryInk: string;
  primarySoft: string;
  heroBg: string;
  heroInk: string;
  heroSoft: string;
  heroTrack: string;
  danger: string;
  dangerSoft: string;
  scrim: string;
}

export const SoTienColors: { light: SoTienPalette; dark: SoTienPalette } = {
  light: {
    bg: '#F0F2F5',
    surface: '#FFFFFF',
    surface2: '#E4E6EB',
    ink: '#1C1E21',
    muted: '#65676B',
    line: '#DADDE1',
    primary: '#1877F2',
    primaryInk: '#FFFFFF',
    primarySoft: '#E7F3FF',
    heroBg: '#A50064',
    heroInk: '#FFFFFF',
    heroSoft: 'rgba(255,255,255,0.78)',
    heroTrack: 'rgba(255,255,255,0.26)',
    danger: '#C9302C',
    dangerSoft: '#FDE7E6',
    scrim: 'rgba(0,0,0,0.48)',
  },
  dark: {
    bg: '#18191A',
    surface: '#242526',
    surface2: '#3A3B3C',
    ink: '#E4E6EB',
    muted: '#B0B3B8',
    line: '#3E4042',
    primary: '#2D88FF',
    primaryInk: '#FFFFFF',
    primarySoft: '#263951',
    heroBg: '#8E0A5C',
    heroInk: '#FFFFFF',
    heroSoft: 'rgba(255,255,255,0.76)',
    heroTrack: 'rgba(255,255,255,0.22)',
    danger: '#F0807A',
    dangerSoft: '#3D2221',
    scrim: 'rgba(0,0,0,0.62)',
  },
};

/**
 * Bộ màu sáng, dành cho các màn hình CHƯA chuyển sang `useColors()`.
 * Sẽ bị gỡ khi tất cả màn hình đã hỗ trợ chế độ tối (giao diện đang ép sáng trong lúc chuyển đổi).
 */
export const PwaColors = SoTienColors.light;

/** Bo góc đo được từ PWA (px). */
export const AppRadius = {
  /** Ô nhập, dòng lịch sử, nút lưu */
  field: 14,
  /** Thẻ thường (lịch sử, bảng mục) */
  card: 16,
  /** Thẻ Đã chi, form nhập, tờ nổi */
  hero: 22,
  /** Thanh phân đoạn */
  segment: 12,
  /** Nút trong thanh phân đoạn */
  segmentItem: 9,
  /** Viên thuốc: nút nổi, thanh tab, chip, ô tháng */
  pill: 999,
} as const;
