import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ToastProvider } from '@/components/toast';
import { FONT_ASSETS } from '@/constants/font-assets';
import { SoTienColors } from '@/constants/palette';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ChromeProvider } from '@/hooks/use-chrome';
import '@/i18n/en';
import { loadLanguage } from '@/i18n/language';

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
  const [languageReady, setLanguageReady] = useState(false);
  const ready = (fontsLoaded || !!fontError) && languageReady;

  // Ngôn ngữ đã chọn được đọc trước khi vẽ màn hình đầu tiên để không thấy chữ đổi từ tiếng Việt sang tiếng Anh.
  useEffect(() => {
    void loadLanguage().finally(() => setLanguageReady(true));
  }, []);

  // Màn hình khởi động (cấu hình trong app.json) giữ nguyên cho tới khi font nạp xong, nên không có
  // cảnh chữ đổi font hoặc bố cục nhảy. Nếu nạp lỗi thì dùng font hệ thống thay vì kẹt.
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
    <ThemeProvider value={navigationTheme(scheme === 'dark' ? 'dark' : 'light')}>
      <ToastProvider>
        <ChromeProvider>
          {/* Màn con: không có thanh tiêu đề / nút Back; vuốt từ cạnh trái sang phải để quay lại (native stack của Expo Router, chỉ từ mép nên không vướng vuốt hàng Sửa/Xoá). */}
          <KeyboardAvoid ignoreWhenModalOpen>
          <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chup-nhanh" />
            <Stack.Screen name="chi-tieu/nhap" />
            <Stack.Screen name="chi-tieu/chi-tiet" />
            <Stack.Screen name="chi-tieu/ca-nhan" />
            <Stack.Screen name="giao-dich" />
            <Stack.Screen name="quy/lich-su" />
            <Stack.Screen name="quy/lich-su-quy" />
            <Stack.Screen name="quy/chi-tieu" />
            <Stack.Screen name="quy/thu-quy" />
            <Stack.Screen name="quy/chi-tiet" />
            <Stack.Screen name="quy/sua" />
            <Stack.Screen name="quy/ung-chi" />
            <Stack.Screen name="quy/cong-no" />
            <Stack.Screen name="chia-bill/lich-su" />
            <Stack.Screen name="thiet-lap" />
            <Stack.Screen name="thiet-lap-muc" />
            <Stack.Screen name="chia-bill/tao" />
            <Stack.Screen name="chia-bill/nguoi" />
            <Stack.Screen name="chia-bill/chi-tiet" />
            <Stack.Screen name="xem-bill" />
            <Stack.Screen name="chia-bill/thanh-toan" />
            <Stack.Screen name="chia-bill/gop" />
            <Stack.Screen name="chia-bill/sua" />
            <Stack.Screen name="cong-no/ghi-nhan" />
            <Stack.Screen name="cong-no/sua" />
            <Stack.Screen name="cong-no/chi-tiet" />
            <Stack.Screen name="cong-no/vay" />
            <Stack.Screen name="cong-no/giao-dich" />
            <Stack.Screen name="cong-no/no-bill" />
            <Stack.Screen name="cong-no/chuyen-tien-bill" />
          </Stack>
          </KeyboardAvoid>
        </ChromeProvider>
      </ToastProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Gốc của react-native-gesture-handler: cần cho cử chỉ vuốt ngang chuyển lớp ở form Chia bill. */
const styles = StyleSheet.create({ root: { flex: 1 } });
