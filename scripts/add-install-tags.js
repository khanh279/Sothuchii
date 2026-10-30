#!/usr/bin/env node
/**
 * Chèn các thẻ <head> "cài lên màn hình chính" vào MỌI file HTML của bản web đã xuất (`expo export --platform web`), để khi người dùng
 * "Thêm vào màn hình chính" (iPhone: Safari → Chia sẻ; Android: Chrome → Cài đặt ứng dụng) ứng dụng hiện như một app thường:
 * icon riêng, tên "Sổ Thu Chi", mở toàn màn hình không thanh địa chỉ.
 *
 * Dùng: node scripts/add-install-tags.js <thư mục xuất bản, mặc định dist> <đường dẫn gốc, ví dụ /Sothuchii; mặc định rỗng>
 * Cũng đăng ký service worker `sw.js` (xem file đó) để mở được khi mất mạng.
 * Manifest và icon nằm trong thư mục `public/` (Expo chép sang thư mục xuất bản). Chạy lại nhiều lần vẫn an toàn (file đã có thẻ thì bỏ qua).
 * Lý do chèn sau khi xuất bản: Expo Router không cho gắn thẻ <head> toàn cục từ layout gốc, còn trang `+html` tuỳ biến làm Expo bỏ mất các thẻ script của ứng dụng.
 */
const fs = require('fs');
const path = require('path');

const dist = path.resolve(process.argv[2] || 'dist');
const base = (process.argv[3] || '').replace(/\/+$/, '');

const tags = [
  '<meta name="description" content="Sổ thu chi cá nhân: chi tiêu, chia bill, nợ và quỹ nhóm."/>',
  `<link rel="manifest" href="${base}/manifest.json"/>`,
  `<link rel="apple-touch-icon" sizes="180x180" href="${base}/icons/apple-touch-icon.png"/>`,
  `<link rel="icon" type="image/png" sizes="192x192" href="${base}/icons/icon-192.png"/>`,
  '<meta name="application-name" content="Sổ Thu Chi"/>',
  '<meta name="apple-mobile-web-app-title" content="Sổ Thu Chi"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default"/>',
  '<meta name="format-detection" content="telephone=no"/>',
  '<meta name="theme-color" content="#F5F7FA" media="(prefers-color-scheme: light)"/>',
  '<meta name="theme-color" content="#0A1220" media="(prefers-color-scheme: dark)"/>',
  // Đăng ký service worker (public/sw.js) để app mở được khi mất mạng; lỗi đăng ký không ảnh hưởng gì khác.
  `<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${base}/sw.js').catch(function(){})})}</script>`,
].join('');

function* htmlFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith('.html')) yield full;
  }
}

if (!fs.existsSync(dist)) {
  console.error(`Không thấy thư mục xuất bản: ${dist}`);
  process.exit(1);
}

// Mã bản xuất bản: mỗi lần xuất bản service worker có bộ nhớ đệm riêng, bản cũ bị xoá khi kích hoạt.
const swFile = path.join(dist, 'sw.js');
if (fs.existsSync(swFile)) {
  const sw = fs.readFileSync(swFile, 'utf8');
  if (sw.includes("const BUILD = '__BUILD__'")) fs.writeFileSync(swFile, sw.replace("const BUILD = '__BUILD__'", "const BUILD = '" + Date.now() + "'"));
}

let changed = 0;
let skipped = 0;
for (const file of htmlFiles(dist)) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('rel="manifest"') || !html.includes('</head>')) {
    skipped++;
    continue;
  }
  // Trang chưa có <title> thì đặt tên ứng dụng (tiêu đề tab trình duyệt, và tên dự phòng khi thêm vào màn hình chính).
  const title = html.includes('<title') ? '' : '<title>Sổ Thu Chi</title>';
  html = html.replace('</head>', `${title}${tags}</head>`).replace('<html lang="en">', '<html lang="vi">');
  fs.writeFileSync(file, html);
  changed++;
}
console.log(`Đã chèn thẻ cài-lên-màn-hình-chính vào ${changed} file HTML (bỏ qua ${skipped}); đường dẫn gốc: "${base}"`);
// Không có file HTML nào (đường dẫn sai / chưa xuất bản) mới là lỗi; chạy lại khi đã chèn rồi thì không sao.
if (changed === 0 && skipped === 0) process.exit(1);
