import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTitle } from '@/components/design';
import { ModalPresence } from '@/components/modal-presence';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { SvgIcon } from '@/components/svg-icon';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Giao diện chỉnh sửa phủ toàn màn hình, bố cục như trang "Sửa chi tiêu": tiêu đề ở đầu trang (cùng vị trí `ScreenTitle` của các trang khác, nút đóng ở góc phải),
 * biểu mẫu trong thẻ trắng ngay dưới tiêu đề, cuộn được. Bàn phím ảo xử lý giống `ExpenseFormScreen`: `KeyboardAvoidingView` (iOS) / tự co lại (Android) và
 * `keyboardShouldPersistTaps="handled"`, nên ô nhập cuối và nút Lưu luôn cuộn tới được. Màn danh sách nằm dưới vẫn còn nguyên (bộ lọc, vị trí cuộn)
 * và đóng biểu mẫu chỉ là bỏ lớp phủ, không đụng tới dữ liệu.
 */
export function TopFormModal({ title, onClose, children }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" visible statusBarTranslucent onRequestClose={onClose}>
      <ModalPresence />
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <ScreenTitle
          title={title}
          topInset={insets.top}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={8} onPress={onClose} style={[styles.close, { backgroundColor: colors.surface2 }]}>
              <SvgIcon name="close" size={18} color={colors.muted} strokeWidth={2.4} />
            </Pressable>
          }
        />
        <KeyboardAvoid>
          <KeyboardAwareScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>
          </KeyboardAwareScrollView>
        </KeyboardAvoid>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop },
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
