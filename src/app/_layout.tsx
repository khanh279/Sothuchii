import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { PwaColors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

/** Giao diện của PWA cũ chỉ có nền sáng (color-scheme: light), nên giữ nguyên chủ đề sáng. */
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
  return (
    <ThemeProvider value={AppTheme}>
      <AnimatedSplashOverlay />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chi-tieu/nhap" options={{ title: 'Thêm khoản chi' }} />
      </Stack>
    </ThemeProvider>
  );
}
