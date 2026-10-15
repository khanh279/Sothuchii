import { SoTienColors, type SoTienPalette } from '@/constants/palette';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Công tắc tạm: ép bộ màu sáng cho tới khi MỌI màn hình đã chuyển sang `useColors()`.
 * Màn hình nào còn dùng màu cố định thì sẽ lệch tông nếu một phần giao diện theo chế độ tối.
 * Đặt về `false` ở bước cuối (cùng lúc gỡ phần ép sáng trong `app/_layout.tsx`).
 */
export const FORCE_LIGHT_UNTIL_MIGRATED = true;

/** Bộ màu của PWA theo chế độ sáng/tối của thiết bị. */
export function useColors(): SoTienPalette {
  const scheme = useColorScheme();
  return !FORCE_LIGHT_UNTIL_MIGRATED && scheme === 'dark' ? SoTienColors.dark : SoTienColors.light;
}
