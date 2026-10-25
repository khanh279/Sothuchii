import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTitle } from '@/components/design';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

/**
 * Khung của một TRANG biểu mẫu thông thường (như Sửa chi tiêu): tiêu đề ở đầu trang (`ScreenTitle`), biểu mẫu trong thẻ trắng ngay dưới, cuộn được và giữ nút Lưu
 * không bị bàn phím che. Không có nút đóng: quay lại bằng vuốt từ cạnh trái như mọi trang khác. Dùng cho các màn sửa mở bằng điều hướng (không phải khung phủ).
 */
export function FormPage({ title, children, card = true }: { title: string; children: ReactNode; /** false: không bọc thẻ trắng (nội dung tự có các thẻ riêng). */ card?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title, headerShown: false }} />
      <ScreenTitle title={title} topInset={insets.top} />
      <KeyboardAwareScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {card ? <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View> : children}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop },
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
});
