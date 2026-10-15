/**
 * Font của PWA (xác minh từ <link> Google Fonts và biến `--st-font-ui`, `--st-font-display`):
 * - Be Vietnam Pro 400 / 500 / 600 / 700: chữ giao diện.
 * - Bricolage Grotesque: chữ "hiển thị" cho số tiền lớn và tiêu đề — mọi chỗ dùng đều ở độ đậm 700
 *   (số tổng ở thẻ Đã chi, ô nhập số tiền, "₫" cạnh ô nhập, tiêu đề form/thiết lập).
 *   Bản PWA nạp cả trục opsz 12–96; bản React Native chỉ có bản tĩnh (xấp xỉ).
 * Tên bên dưới trùng với tên font đăng ký trong `font-assets.ts`.
 *
 * React Native không dùng `fontWeight` với font tuỳ chỉnh, nên mỗi độ đậm là một tên font riêng.
 */
export const AppFonts = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  display: 'BricolageGrotesque_700Bold',
} as const;

export type AppFontKey = keyof typeof AppFonts;

/** Độ đậm CSS -> khóa font. 800 không có trong bản nạp của PWA nên trình duyệt dùng 700. */
export function fontKeyForWeight(weight: number | string): Exclude<AppFontKey, 'display'> {
  const value = Number(weight);
  if (value >= 700) return 'bold';
  if (value >= 600) return 'semibold';
  if (value >= 500) return 'medium';
  return 'regular';
}
