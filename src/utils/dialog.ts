import { Alert, Platform } from 'react-native';

/**
 * Hộp thoại xác nhận chạy được trên cả điện thoại và web
 * (Alert.alert của react-native-web không làm gì cả).
 */
export function confirmAsync(title: string, message: string, confirmLabel: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ask = (globalThis as { confirm?: (text: string) => boolean }).confirm;
    return Promise.resolve(ask ? ask(`${title}\n${message}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Thông báo ngắn một nút. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    const show = (globalThis as { alert?: (text: string) => void }).alert;
    show?.(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
