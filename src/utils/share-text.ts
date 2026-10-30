import { Platform, Share } from 'react-native';

/**
 * Gửi một đoạn văn bản ra ngoài app: điện thoại mở bảng chia sẻ của hệ điều hành (Zalo, Messenger, SMS, sao chép…); web mở bảng chia sẻ của trình duyệt nếu có, không thì sao chép vào bộ nhớ tạm.
 * Trả về 'shared' (đã mở bảng chia sẻ) hoặc 'copied' (đã sao chép); ném lỗi nếu cả hai đều không được.
 */
export async function shareText(text: string): Promise<'shared' | 'copied'> {
  if (Platform.OS !== 'web') {
    await Share.share({ message: text });
    return 'shared';
  }
  const nav = globalThis.navigator as (Navigator & { share?: (data: { text: string }) => Promise<void> }) | undefined;
  if (nav?.share) {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'shared'; // người dùng đóng bảng chia sẻ
    }
  }
  await nav?.clipboard?.writeText(text);
  return 'copied';
}
