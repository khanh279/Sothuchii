import { SoTienColors, type SoTienPalette } from '@/constants/palette';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Bộ màu của PWA theo chế độ sáng/tối của hệ thống (sáng khi hệ thống không báo gì). */
export function useColors(): SoTienPalette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? SoTienColors.dark : SoTienColors.light;
}
