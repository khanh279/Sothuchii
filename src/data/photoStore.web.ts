/**
 * Kho ảnh trên WEB: IndexedDB `sothuchi-photos`, mỗi ảnh một bản ghi `{ id, dataUrl, createdAt }` (ảnh JPEG đã thu nhỏ, dạng data URL). Đọc không ném lỗi khi IndexedDB không dùng được
 * (trả null / rỗng); ghi ném lỗi để biểu mẫu báo cho người dùng.
 */

const DB_NAME = 'sothuchi-photos';
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Không mở được kho ảnh.'));
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('Lỗi kho ảnh.'));
        };
      }),
  );
}

interface Row {
  id: string;
  dataUrl: string;
  createdAt: number;
}

/** Ghi một ảnh (data URL JPEG). */
export async function putPhoto(id: string, dataUrl: string, now: number = Date.now()): Promise<void> {
  const row: Row = { id, dataUrl, createdAt: now };
  await run('readwrite', (store) => store.put(row));
}

/** Địa chỉ để hiển thị ảnh (data URL); không có thì null. */
export async function getPhotoUri(id: string): Promise<string | null> {
  try {
    const row = await run<Row | undefined>('readonly', (store) => store.get(id));
    return row?.dataUrl ?? null;
  } catch {
    return null;
  }
}

/** Nội dung ảnh dạng data URL để đưa vào file sao lưu. */
export const readPhotoDataUrl = getPhotoUri;

export async function deletePhoto(id: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(id));
  } catch {
    // không xoá được thì bỏ qua: ảnh mồ côi sẽ được dọn lần sau
  }
}

export async function listPhotos(): Promise<{ id: string; createdAt: number }[]> {
  try {
    const rows = await run<Row[]>('readonly', (store) => store.getAll());
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt }));
  } catch {
    return [];
  }
}
