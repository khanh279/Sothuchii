import { usedPhotoIds } from '@/data/backupRepository';
import { deletePhoto, listPhotos } from '@/data/photoStore';
import { orphanPhotoIds } from '@/domain/photos';

/**
 * Dọn ảnh mồ côi: xoá những ảnh có trong kho nhưng không khoản chi / bill / giao dịch / chi tiêu quỹ nào dùng và đã tạo hơn một ngày (ảnh vừa chọn trong biểu mẫu chưa lưu thì được giữ).
 * Nếu việc đọc dữ liệu lỗi thì KHÔNG xoá gì (không bao giờ xoá ảnh khi chưa biết chắc ảnh nào đang được dùng). Trả về số ảnh đã xoá.
 */
export async function cleanOrphanPhotos(now: number = Date.now()): Promise<number> {
  try {
    const stored = await listPhotos();
    if (stored.length === 0) return 0;
    const used = new Set(await usedPhotoIds());
    const orphans = orphanPhotoIds(stored, used, now);
    for (const id of orphans) await deletePhoto(id);
    return orphans.length;
  } catch {
    return 0;
  }
}
