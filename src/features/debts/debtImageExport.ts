import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, type HostInstance } from 'react-native';

import { captureBillImage, type ExportResult } from '@/features/bills/billImageExport';

const WEB_MESSAGE = 'Chức năng này chỉ dùng được trên ứng dụng điện thoại';

function describe(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? `${fallback}: ${error.message}` : fallback;
}

/** Lưu ảnh nhắc nợ vào thư viện ảnh (cùng cách chụp với ảnh bill). Chỉ xin quyền ghi; bị từ chối thì báo rõ. */
export async function saveDebtImage(view: HostInstance | null): Promise<ExportResult> {
  if (Platform.OS === 'web') return { ok: false, message: WEB_MESSAGE };
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return { ok: false, message: 'Cần cho phép truy cập thư viện ảnh để lưu ảnh' };
    await MediaLibrary.saveToLibraryAsync(await captureBillImage(view));
    return { ok: true, message: 'Đã lưu ảnh vào thư viện ảnh' };
  } catch (error) {
    return { ok: false, message: describe(error, 'Không lưu được ảnh') };
  }
}

/** Chụp ảnh nhắc nợ rồi mở bảng chia sẻ của hệ điều hành với chính tệp ảnh đó. */
export async function shareDebtImage(view: HostInstance | null): Promise<ExportResult> {
  if (Platform.OS === 'web') return { ok: false, message: WEB_MESSAGE };
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, message: 'Thiết bị này không hỗ trợ chia sẻ tệp' };
    await Sharing.shareAsync(await captureBillImage(view), { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Chia sẻ ảnh nhắc nợ' });
    return { ok: true, message: '' };
  } catch (error) {
    return { ok: false, message: describe(error, 'Không chia sẻ được ảnh') };
  }
}
