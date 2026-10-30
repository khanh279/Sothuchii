export const PHOTO_MAX_SIDE = 1000;
export const PHOTO_QUALITY = 0.7;

export type PhotoSource = 'library' | 'camera';

/** Mở ô chọn file của trình duyệt (cho chọn nhiều ảnh một lúc); đóng hộp chọn không chọn gì thì trả mảng rỗng. */
function chooseFiles(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** Đọc file ảnh, thu nhỏ bằng canvas rồi trả data URL JPEG. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không xử lý được ảnh.');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

/** Chọn tối đa `limit` ảnh (web: không phân biệt thư viện / camera, trình duyệt tự hỏi) rồi thu nhỏ từng ảnh; trả mảng rỗng nếu huỷ. */
export async function pickPhotos(_source: PhotoSource, limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const files = (await chooseFiles(limit > 1)).slice(0, limit);
  const urls: string[] = [];
  for (const file of files) urls.push(await shrink(file));
  return urls;
}
