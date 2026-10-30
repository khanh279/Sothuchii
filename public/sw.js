/*
 * Service worker của Sổ Thu Chi (chỉ có ở bản web đã xuất bản): giúp app MỞ ĐƯỢC KHI MẤT MẠNG sau lần mở đầu tiên có mạng.
 * - Cài đặt: tải trang gốc, đọc các file tĩnh nó dùng (JS, CSS, ảnh, font) và lưu sẵn vào bộ nhớ đệm.
 * - Trang (HTML): thử mạng trước để luôn lấy bản mới; mất mạng thì dùng bản đã lưu.
 * - File tĩnh khác cùng nguồn (tên file có mã băm nên không đổi nội dung): dùng bản đã lưu trước, chưa có thì tải rồi lưu.
 * Dữ liệu của người dùng nằm trong bộ nhớ trình duyệt, không đi qua service worker. `__BUILD__` được thay bằng mã mỗi lần xuất bản (scripts/add-install-tags.js) để mỗi bản có bộ nhớ đệm riêng, bản cũ bị xoá khi kích hoạt.
 */
const BUILD = '__BUILD__';
const CACHE = `sothuchi-${BUILD}`;
const SCOPE = self.registration.scope;

/** Các địa chỉ cùng nguồn mà trang gốc tham chiếu (script, stylesheet, icon, manifest). */
function assetUrls(html) {
  const urls = new Set([SCOPE, new URL('manifest.json', SCOPE).href]);
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    try {
      const url = new URL(match[1], SCOPE);
      if (url.origin === self.location.origin && url.href.startsWith(SCOPE)) urls.add(url.href);
    } catch (_) {
      // địa chỉ không hợp lệ: bỏ qua
    }
  }
  return [...urls];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const response = await fetch(SCOPE, { cache: 'reload' });
        const html = await response.clone().text();
        await cache.put(SCOPE, response);
        await Promise.allSettled(assetUrls(html).filter((url) => url !== SCOPE).map((url) => cache.add(url)));
      } catch (_) {
        // đang mất mạng lúc cài: vẫn cài được, các file sẽ được lưu dần khi dùng
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('sothuchi-') && name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match(SCOPE));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : cacheFirst(request));
});
