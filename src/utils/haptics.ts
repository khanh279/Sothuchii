import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Rung nhẹ làm phản hồi cho thao tác quan trọng. Chỉ có trên điện thoại (web bỏ qua); máy không hỗ trợ hoặc lỗi thì im lặng, không bao giờ làm hỏng thao tác chính.
 * - `tapHaptic`: chạm nhẹ khi bấm lưu / ghi nhận / xác nhận.
 * - `warnHaptic`: rung cảnh báo khi hiện hộp xác nhận (ví dụ xóa) hoặc vừa xóa (còn hoàn tác).
 */
function run(effect: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  effect().catch(() => undefined);
}

export const tapHaptic = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const warnHaptic = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
