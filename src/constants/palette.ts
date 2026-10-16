/**
 * Bộ màu "Minimal Finance" của ứng dụng: nền trắng / xám rất nhạt, xanh navy đậm là màu chủ đạo (thẻ số liệu, nút chính),
 * xanh teal nhẹ làm màu nhấn, xanh lá cho tiền nhận, đỏ cho tiền phải trả / cảnh báo, còn lại là màu trung tính.
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
  /** Màu nhấn teal nhẹ (biểu tượng lối vào, chip đang chọn). */
  accent: string;
  accentSoft: string;
  /** Tiền nhận / trạng thái tích cực. */
  success: string;
  successSoft: string;
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
    primary: '#0B2A4A',
    primaryInk: '#FFFFFF',
    primarySoft: '#E6EDF6',
    heroBg: '#0B2A4A',
    heroInk: '#FFFFFF',
    heroSoft: 'rgba(255,255,255,0.72)',
    heroTrack: 'rgba(255,255,255,0.22)',
    danger: '#D64545',
    dangerSoft: '#FCEBEB',
    accent: '#0E8F9B',
    accentSoft: '#E2F4F5',
    success: '#0F8A4B',
    successSoft: '#E3F5EA',
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
    heroBg: '#143A66',
    heroInk: '#FFFFFF',
    heroSoft: 'rgba(255,255,255,0.74)',
    heroTrack: 'rgba(255,255,255,0.22)',
    danger: '#F08A84',
    dangerSoft: '#3A2224',
    accent: '#3DC1CC',
    accentSoft: '#143338',
    success: '#4CC38A',
    successSoft: '#163A2A',
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
