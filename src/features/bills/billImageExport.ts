import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Kết quả một thao tác xuất ảnh: `ok` kèm lời nhắn hiển thị cho người dùng. */
export interface ExportResult {
  ok: boolean;
  message: string;
}

const WEB_MESSAGE = 'Chức năng này chỉ dùng được trên ứng dụng điện thoại';

/**
 * Cơ chế tạo ảnh bill dùng chung cho "Lưu ảnh" và "Chia sẻ": chụp nguyên khung `BillImage` (cao theo nội dung, nên bill nhiều người
 * không bị cắt) thành tệp PNG tạm, độ phân giải theo màn hình thiết bị. Trả về đường dẫn tệp tạm.
 */
export async function captureBillImage(view: View | null): Promise<string> {
  if (!view) throw new Error('Chưa dựng xong ảnh bill, hãy thử lại');
  return captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? `${fallback}: ${error.message}` : fallback;
}

/** Lưu ảnh bill vào thư viện ảnh. Chỉ xin quyền ghi (không đọc thư viện); bị từ chối thì báo rõ, không chụp. */
export async function saveBillImage(view: View | null): Promise<ExportResult> {
  if (Platform.OS === 'web') return { ok: false, message: WEB_MESSAGE };
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return { ok: false, message: 'Cần cho phép truy cập thư viện ảnh để lưu ảnh bill' };
    const uri = await captureBillImage(view);
    await MediaLibrary.saveToLibraryAsync(uri);
    return { ok: true, message: 'Đã lưu ảnh bill vào thư viện ảnh' };
  } catch (error) {
    return { ok: false, message: describe(error, 'Không lưu được ảnh bill') };
  }
}

/** Chụp ảnh bill rồi mở bảng chia sẻ của hệ điều hành với chính tệp ảnh đó (không chỉ gửi đường dẫn hay văn bản). */
export async function shareBillImage(view: View | null): Promise<ExportResult> {
  if (Platform.OS === 'web') return { ok: false, message: WEB_MESSAGE };
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, message: 'Thiết bị này không hỗ trợ chia sẻ tệp' };
    const uri = await captureBillImage(view);
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Chia sẻ bill' });
    return { ok: true, message: '' };
  } catch (error) {
    return { ok: false, message: describe(error, 'Không chia sẻ được ảnh bill') };
  }
}
