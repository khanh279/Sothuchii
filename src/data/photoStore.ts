import { Directory, File, Paths } from 'expo-file-system';

/**
 * Kho ảnh trên ĐIỆN THOẠI: mỗi ảnh là một file JPEG `<mã>.jpg` trong thư mục `photos` của ứng dụng (không nằm trong thư viện ảnh của máy). Ảnh vào / ra dạng data URL JPEG để dùng chung
 * với bản web và file sao lưu. Đọc không ném lỗi (trả null / rỗng); ghi ném lỗi để biểu mẫu báo cho người dùng.
 */

const PREFIX = 'data:image/jpeg;base64,';

function folder(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ idempotent: true });
  return dir;
}

const fileOf = (id: string): File => new File(folder(), `${id}.jpg`);

export async function putPhoto(id: string, dataUrl: string): Promise<void> {
  const base64 = dataUrl.startsWith(PREFIX) ? dataUrl.slice(PREFIX.length) : dataUrl.replace(/^data:[^,]*,/, '');
  const file = fileOf(id);
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });
}

/** Địa chỉ file để hiển thị ảnh; không có thì null. */
export async function getPhotoUri(id: string): Promise<string | null> {
  try {
    const file = fileOf(id);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Nội dung ảnh dạng data URL để đưa vào file sao lưu. */
export async function readPhotoDataUrl(id: string): Promise<string | null> {
  try {
    const file = fileOf(id);
    return file.exists ? `${PREFIX}${await file.base64()}` : null;
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    const file = fileOf(id);
    if (file.exists) file.delete();
  } catch {
    // không xoá được thì bỏ qua: ảnh mồ côi sẽ được dọn lần sau
  }
}

export async function listPhotos(): Promise<{ id: string; createdAt: number }[]> {
  try {
    return folder()
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.jpg'))
      .map((entry) => ({ id: entry.name.slice(0, -4), createdAt: entry.modificationTime ?? 0 }));
  } catch {
    return [];
  }
}
