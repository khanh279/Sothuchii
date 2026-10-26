import type { Category } from '@/types/expense';

/** Giới hạn đã xác minh trong PWA. */
export const MAX_CUSTOM_CATEGORIES = 12;
export const CATEGORY_NAME_MAX = 24;
export const MEMO_MAX = 80;
/** Độ dài tối đa của dòng chi tiết phụ `i` của khoản chi tự ghi (do Quỹ / Chia bill ghi). */
export const DETAIL_MAX = 120;
export const AMOUNT_MAX_DIGITS = 12;
export const MAX_AMOUNT = 999_999_999_999;
/** Kỳ "Tuỳ chọn" xem tối đa 5 năm; biểu đồ theo ngày khi kỳ ≤ 62 ngày. */
export const CUSTOM_RANGE_MAX_YEARS = 5;
export const MAX_DAY_BUCKETS = 62;

export const FUND_CATEGORY_ID = 'fund';
export const OTHER_CATEGORY_ID = 'other';
/** Mục chi mặc định khi mở form thêm khoản chi. */
export const DEFAULT_CATEGORY_ID = 'food';

/** 12 mục mặc định (11 mục của PWA cộng "Đầu tư" đặt trước "Quỹ"). 'other' (Khác) luôn nằm cuối danh sách hiển thị. */
export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: 'food', name: 'Ăn uống', color: '#E0703A' },
  { id: 'fun', name: 'Giải trí', color: '#8B5CF6' },
  { id: 'shop', name: 'Mua sắm', color: '#E0478C' },
  { id: 'gift', name: 'Hiếu hỉ', color: '#D23B3B' },
  { id: 'trip', name: 'Du lịch', color: '#1E9BD7' },
  { id: 'move', name: 'Di chuyển', color: '#2FA36B' },
  { id: 'bill', name: 'Hoá đơn', color: '#C99A12' },
  { id: 'health', name: 'Sức khoẻ', color: '#14A3A3' },
  { id: 'edu', name: 'Học tập', color: '#5B6EE8' },
  { id: 'invest', name: 'Đầu tư', color: '#3F6FB5' },
  { id: FUND_CATEGORY_ID, name: 'Quỹ', color: '#0F8A8A', icon: 'coin' },
  { id: OTHER_CATEGORY_ID, name: 'Khác', color: '#7C8A86' },
];

/** Biểu tượng người dùng được chọn cho mục riêng. */
export const CUSTOM_ICON_IDS = [
  'home',
  'pet',
  'person',
  'coffee',
  'phone',
  'shirt',
  'car',
  'music',
  'sport',
  'plant',
  'spark',
  'star',
] as const;

/** Màu gán cho mục riêng, quay vòng theo số mục riêng đã có. */
export const CUSTOM_COLORS = ['#A0623A', '#3F8FC4', '#B24BC7', '#6B9A2D', '#D0577A', '#4C7D8C'] as const;

/** Biểu tượng mặc định khi mục riêng không có icon hợp lệ. */
export const FALLBACK_ICON = 'star';

/** Đường vẽ SVG (viewBox 24x24, nét đơn). Bộ biểu tượng làm lại gọn, hiện đại (nét bo tròn, ít chi tiết); mã biểu tượng giữ nguyên nên dữ liệu cũ không đổi. */
export const ICON_PATHS: Readonly<Record<string, string>> = {
  food: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M9 4v3M12 3v4M15 4v3"/>',
  fun: '<rect x="3" y="7.5" width="18" height="10" rx="5"/><path d="M8 10.5v4M6 12.5h4M15.5 11.5h.01M17.5 13.5h.01"/>',
  shop: '<circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/><path d="M3 4h2.5l2.2 10.5h10l1.8-7.5H6.3"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 8v12.5M12 8C10.8 4.8 7 4.6 7 6.8 7 8 9 8 12 8ZM12 8c1.2-3.2 5-3.4 5-1.2 0 1.2-2 1.2-5 1.2Z"/>',
  trip: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  move: '<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16M8 20v-3M16 20v-3M8 14h.01M16 14h.01"/>',
  bill: '<path d="M13 3 6 13.5h5.5L11 21l7-10.5h-5.5L13 3Z"/>',
  health: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  invest: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  edu: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5Z"/><path d="M6.5 11.8V16c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5v-4.2M21.5 9.5V15"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9.5a.5.5 0 0 0 .5.5H10v-5h4v5h3.5a.5.5 0 0 0 .5-.5V10"/>',
  pet: '<circle cx="7" cy="10" r="1.5"/><circle cx="10.5" cy="6.5" r="1.5"/><circle cx="14.5" cy="6.5" r="1.5"/><circle cx="18" cy="10" r="1.5"/><path d="M8 17c0-2.5 2-5 4.5-5s4.5 2.5 4.5 5c0 2-2 2.5-4.5 2.5S8 19 8 17Z"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z"/><path d="M16 10h2a2 2 0 0 1 0 5h-2M8 3v3M12 3v3"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  shirt: '<path d="M8 4 3 7l2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 0 1-8 0Z"/>',
  car: '<path d="M4 16v-4l2-4.5a1.5 1.5 0 0 1 1.4-.9h9.2a1.5 1.5 0 0 1 1.4.9L20 12v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M4 12h16M7.5 19v-2M16.5 19v-2M8 14.5h.01M16 14.5h.01"/>',
  music: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M14.5 9.5h-3.5a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H9.5"/>',
  sport: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  plant: '<path d="M12 20v-8M12 12c0-4-3-6-7-6 0 4 3 6 7 6ZM12 14c0-3 2.5-5 7-5 0 3.5-3 5-7 5Z"/>',
  spark: '<path d="M10 4l1.5 4.5L16 10l-4.5 1.5L10 16l-1.5-4.5L4 10l4.5-1.5L10 4ZM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
  other: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
};
