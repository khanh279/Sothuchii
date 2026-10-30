import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Cạnh dài tối đa của ảnh sau khi thu nhỏ (px) và chất lượng JPEG: đủ đọc chữ trên hóa đơn mà mỗi ảnh chỉ khoảng vài chục đến ~150KB. */
export const PHOTO_MAX_SIDE = 1000;
export const PHOTO_QUALITY = 0.7;

export type PhotoSource = 'library' | 'camera';

async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const longSide = Math.max(asset.width, asset.height);
  const resize = longSide > PHOTO_MAX_SIDE ? (asset.width >= asset.height ? { width: PHOTO_MAX_SIDE } : { height: PHOTO_MAX_SIDE }) : null;
  const shrunk = await ImageManipulator.manipulateAsync(asset.uri, resize ? [{ resize }] : [], { compress: PHOTO_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!shrunk.base64) throw new Error('Không đọc được ảnh.');
  return `data:image/jpeg;base64,${shrunk.base64}`;
}

/**
 * Chọn ảnh từ thư viện (được chọn NHIỀU ảnh một lúc, tối đa `limit`) hoặc chụp một ảnh bằng camera (điện thoại), thu nhỏ rồi trả về các data URL JPEG; người dùng huỷ thì trả mảng rỗng,
 * không cấp quyền thì ném lỗi. (Bản web dùng `pickPhoto.web.ts`: ô chọn file của trình duyệt.)
 */
export async function pickPhotos(source: PhotoSource, limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(source === 'camera' ? 'Chưa cấp quyền dùng camera.' : 'Chưa cấp quyền xem thư viện ảnh.');
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false, allowsMultipleSelection: limit > 1, selectionLimit: limit });
  if (result.canceled) return [];
  const urls: string[] = [];
  for (const asset of result.assets.slice(0, limit)) urls.push(await shrink(asset));
  return urls;
}
