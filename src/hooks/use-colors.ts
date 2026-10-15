import { SoTienColors, type SoTienPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Bộ màu của PWA theo chế độ sáng/tối của thiết bị. */
export function useColors(): SoTienPalette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? SoTienColors.dark : SoTienColors.light;
}
