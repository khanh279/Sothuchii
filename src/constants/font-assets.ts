import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
} from '@expo-google-fonts/be-vietnam-pro';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';

import { AppFonts } from '@/constants/fonts';

/** Bản đồ tên font -> file, đưa cho `useFonts` ở màn hình gốc. */
export const FONT_ASSETS = {
  [AppFonts.regular]: BeVietnamPro_400Regular,
  [AppFonts.medium]: BeVietnamPro_500Medium,
  [AppFonts.semibold]: BeVietnamPro_600SemiBold,
  [AppFonts.bold]: BeVietnamPro_700Bold,
  [AppFonts.display]: BricolageGrotesque_700Bold,
};
