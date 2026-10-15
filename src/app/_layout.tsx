import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { ToastProvider } from '@/components/toast';
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
  const ready = fontsLoaded || !!fontError;

  // Màn hình khởi động (cấu hình trong app.json) giữ nguyên cho tới khi font nạp xong, nên không có
  // cảnh chữ đổi font hoặc bố cục nhảy. Nếu nạp lỗi thì dùng font hệ thống thay vì kẹt.
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={AppTheme}>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chi-tieu/nhap" />
          <Stack.Screen name="lich-su" />
        </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}
