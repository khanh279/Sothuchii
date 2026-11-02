/**
 * Một họ chữ cho toàn ứng dụng: Be Vietnam Pro 400 / 500 / 600 / 700. Chữ "hiển thị" (số tiền lớn, tiêu đề) dùng cùng họ này ở độ đậm 700
 * để chữ đồng bộ (trước đây dùng thêm Bricolage Grotesque theo PWA).
 * Tên bên dưới trùng với tên font đăng ký trong `font-assets.ts`.
 *
 * React Native không dùng `fontWeight` với font tuỳ chỉnh, nên mỗi độ đậm là một tên font riêng.
 */
export const AppFonts = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  display: 'BeVietnamPro_700Bold',
} as const;

export type AppFontKey = keyof typeof AppFonts;