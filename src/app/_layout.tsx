import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { FONT_ASSETS } from '@/constants/font-assets';
import { PwaColors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Tạm thời ép chủ đề sáng: các màn hình chưa chuyển sang `useColors()` (chế độ tối của PWA)
 * nên chưa thể theo hệ thống. Sẽ gỡ khi mọi màn hình đã hỗ trợ chế độ tối.
 */
const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: PwaColors.primary,
    background: PwaColors.bg,
    card: PwaColors.surface,
    text: PwaColors.ink,
    border: PwaColors.line,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  // Chưa nạp xong font thì không vẽ gì: màn hình khởi động vẫn che phía trên (preventAutoHideAsync),
  // nên không có cảnh chữ đổi font hay bố cục nhảy. Nếu nạp lỗi thì dùng font hệ thống thay vì kẹt.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={AppTheme}>
      <AnimatedSplashOverlay />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chi-tieu/nhap" options={{ title: 'Thêm khoản chi' }} />
        <Stack.Screen name="lich-su" options={{ title: 'Chi tiêu cá nhân' }} />
      </Stack>
    </ThemeProvider>
  );
}
