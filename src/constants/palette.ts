/**
 * Bộ màu "Minimal Finance" của ứng dụng: nền trắng / xám rất nhạt, xanh navy đậm là màu chủ đạo (thẻ số liệu, nút chính),
 * xanh dương làm màu nhấn (liên kết, nút +, chip), xanh lá cho tiền nhận, đỏ cho tiền phải trả / cảnh báo, còn lại là màu trung tính.
 * Bốn màu `icon*` dành cho biểu tượng nhận diện từng nhóm chức năng ở các ô Tổng quan.
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
  /** Màu nhấn xanh dương (liên kết, nút +). */
  accent: string;
  accentSoft: string;
  /** Tiền nhận / trạng thái tích cực. */
  success: string;
  successSoft: string;
  /** Trạng thái "một phần" / cảnh báo nhẹ (vàng cam). */
  warning: string;
  warningSoft: string;
  /** Màu biểu tượng nhận diện nhóm chức năng (chia bill, công nợ, quỹ, chi tiêu). */
  iconBlue: string;
  iconPurple: string;
  iconTeal: string;
  iconOrange: string;
  scrim: string;
}

export const SoTienColors: { light: SoTienPalette; dark: SoTienPalette } = {
  light: {
    bg: '#F5F7FA',
    surface: '#FFFFFF',
    surface2: '#EBEFF5',
    ink: '#0F1B2D',
    muted: '#6B7789',
    line: '#E8ECF2',
    primary: '#1B2A4E',
    primaryInk: '#FFFFFF',
    primarySoft: '#E8ECF5',
    heroBg: '#1B2A4E',
    heroInk: '#FFFFFF',
    heroSoft: 'rgba(255,255,255,0.72)',
    heroTrack: 'rgba(255,255,255,0.22)',
    danger: '#D64545',
    dangerSoft: '#FCEBEB',
    accent: '#2563EB',
    accentSoft: '#E8EFFD',
    success: '#0F8A4B',
    successSoft: '#E3F5EA',
    warning: '#B45309',
    warningSoft: '#FEF1DC',
    iconBlue: '#2563EB',
    iconPurple: '#7C3AED',
    iconTeal: '#0D9488',
    iconOrange: '#D97706',
    scrim: 'rgba(0,0,0,0.48)',
  },
  dark: {
    bg: '#0A1220',
    surface: '#121C2E',
    surface2: '#1A2740',
    ink: '#E8EEF7',
    muted: '#93A0B5',
    line: '#22304A',
    primary: '#4F83E8',
    primaryInk: '#FFFFFF',
    primarySoft: '#1B2B4A',
    heroBg: '#1E3560',
    heroInk: '#FFFFFF',
    heroSoft: 'rgba(255,255,255,0.74)',
    heroTrack: 'rgba(255,255,255,0.22)',
    danger: '#F08A84',
    dangerSoft: '#3A2224',
    accent: '#6EA0FF',
    accentSoft: '#172A4F',
    success: '#4CC38A',
    successSoft: '#163A2A',
    warning: '#FBBF24',
    warningSoft: '#3A2D12',
    iconBlue: '#6EA0FF',
    iconPurple: '#A78BFA',
    iconTeal: '#2DD4BF',
    iconOrange: '#FBBF24',
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
  /** Thẻ tổng chi tiêu, form nhập, tờ nổi */
  hero: 22,
  /** Thanh phân đoạn */
  segment: 12,
  /** Nút trong thanh phân đoạn */
  segmentItem: 9,
  /** Viên thuốc: nút nổi, thanh tab, chip, ô tháng */
  pill: 999,
} as const;
