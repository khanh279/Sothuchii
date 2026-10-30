/**
 * Ảnh đính kèm (hàm thuần): mỗi khoản chi cá nhân, bill, giao dịch chuyển tiền và khoản chi quỹ có thể mang tối đa `MAX_PHOTOS` ảnh (ví dụ ảnh hóa đơn). Dữ liệu chỉ giữ MÃ ảnh (`ph`);
 * nội dung ảnh nằm ở kho ảnh riêng trên máy (`data/photoStore`), nên bản ghi vẫn nhẹ và các bản ghi cũ (không có `ph`) không đổi.
 */

export const MAX_PHOTOS = 4;

/** Mã ảnh hợp lệ: chữ, số, gạch dưới / gạch ngang, 6–40 ký tự (dùng làm tên file nên không cho ký tự khác). */
export const isPhotoId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(value);

/** Đọc danh sách mã ảnh đã lưu: bỏ mã sai dạng và mã trùng, tối đa `MAX_PHOTOS`; rỗng thì trả undefined (bản ghi không có trường). */
export function normalizePhotoIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = [...new Set(raw.filter(isPhotoId))].slice(0, MAX_PHOTOS);
  return ids.length > 0 ? ids : undefined;
}

/** Mã ảnh của các bản ghi THÔ (đọc thẳng từ kho, chưa chuẩn hoá): lấy trường `ph` hợp lệ của từng phần tử, không trùng. */
export function photoIdsOfRaw(items: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (item && typeof item === 'object') for (const id of normalizePhotoIds((item as { ph?: unknown }).ph) ?? []) ids.add(id);
  }
  return [...ids];
}

/** Chỉ giữ ảnh hợp lệ trong file sao lưu: mã đúng dạng và nội dung là data URL ảnh. */
export function validBackupPhotos(raw: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [id, dataUrl] of Object.entries(raw as Record<string, unknown>)) {
    if (isPhotoId(id) && typeof dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) result[id] = dataUrl;
  }
  return result;
}

/** Mã ảnh mới: thời điểm (base 36) + 5 ký tự ngẫu nhiên. */
export function newPhotoId(now: number, random: () => number = Math.random): string {
  return `p${now.toString(36)}${Math.floor(random() * 36 ** 5).toString(36).padStart(5, '0')}`;
}

/** Mọi mã ảnh đang được dữ liệu dùng (để dọn ảnh mồ côi). */
export function referencedPhotoIds(lists: readonly (readonly { ph?: readonly string[] }[])[]): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) for (const item of list) for (const id of item.ph ?? []) ids.add(id);
  return ids;
}

/** Ảnh mồ côi cần xoá: có trong kho nhưng không ai dùng và đã tạo từ `graceMs` trước (ảnh vừa chọn trong biểu mẫu chưa lưu thì giữ). */
export function orphanPhotoIds(stored: readonly { id: string; createdAt: number }[], used: ReadonlySet<string>, now: number, graceMs = 24 * 3600_000): string[] {
  return stored.filter((photo) => !used.has(photo.id) && now - photo.createdAt >= graceMs).map((photo) => photo.id);
}
