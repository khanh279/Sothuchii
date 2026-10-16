import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { ToastProvider } from '@/components/toast';
import { FONT_ASSETS } from '@/constants/font-assets';
import { SoTienColors } from '@/constants/palette';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ChromeProvider } from '@/hooks/use-chrome';

SplashScreen.preventAutoHideAsync();

/** Chủ đề điều hướng theo bộ màu sáng/tối của PWA (nền, thẻ, chữ, viền). */
function navigationTheme(scheme: 'light' | 'dark') {
  const palette = SoTienColors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.bg,
      card: palette.surface,
      text: palette.ink,
      border: palette.line,
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const ready = fontsLoaded || !!fontError;

  // Màn hình khởi động (cấu hình trong app.json) giữ nguyên cho tới khi font nạp xong, nên không có
  // cảnh chữ đổi font hoặc bố cục nhảy. Nếu nạp lỗi thì dùng font hệ thống thay vì kẹt.
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={navigationTheme(scheme === 'dark' ? 'dark' : 'light')}>
      <ToastProvider>
        <ChromeProvider>
          {/* Màn con: không có thanh tiêu đề / nút Back; vuốt từ cạnh trái sang phải để quay lại (native stack của Expo Router, chỉ từ mép nên không vướng vuốt hàng Sửa/Xoá). */}
          <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chi-tieu/nhap" />
            <Stack.Screen name="chi-tieu/chi-tiet" />
            <Stack.Screen name="lich-su" />
            <Stack.Screen name="quy/lich-su" />
            <Stack.Screen name="quy/chi-tieu" />
            <Stack.Screen name="chia-bill/lich-su" />
            <Stack.Screen name="thiet-lap" />
            <Stack.Screen name="chia-bill/tao" />
            <Stack.Screen name="chia-bill/nguoi" />
            <Stack.Screen name="chia-bill/chi-tiet" />
            <Stack.Screen name="chia-bill/sua" />
            <Stack.Screen name="cong-no/lich-su" />
            <Stack.Screen name="cong-no/ghi-nhan" />
            <Stack.Screen name="cong-no/sua" />
            <Stack.Screen name="cong-no/chi-tiet" />
          </Stack>
        </ChromeProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
