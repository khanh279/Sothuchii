import type { Category } from '@/types/expense';

/** Giới hạn đã xác minh trong PWA. */
export const MAX_CUSTOM_CATEGORIES = 12;
export const CATEGORY_NAME_MAX = 24;
export const MEMO_MAX = 80;
export const AMOUNT_MAX_DIGITS = 12;
export const MAX_AMOUNT = 999_999_999_999;
/** Kỳ "Tuỳ chọn" xem tối đa 5 năm; biểu đồ theo ngày khi kỳ ≤ 62 ngày. */
export const CUSTOM_RANGE_MAX_YEARS = 5;
export const MAX_DAY_BUCKETS = 62;

export const FUND_CATEGORY_ID = 'fund';
export const OTHER_CATEGORY_ID = 'other';
/** Mục chi mặc định khi mở form thêm khoản chi. */
export const DEFAULT_CATEGORY_ID = 'food';

/** 11 mục mặc định, đúng thứ tự PWA. 'other' (Khác) luôn nằm cuối danh sách hiển thị. */
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
  'coin',
  'sport',
  'plant',
  'spark',
  'star',
] as const;

/** Màu gán cho mục riêng, quay vòng theo số mục riêng đã có. */
export const CUSTOM_COLORS = ['#A0623A', '#3F8FC4', '#B24BC7', '#6B9A2D', '#D0577A', '#4C7D8C'] as const;

/** Biểu tượng mặc định khi mục riêng không có icon hợp lệ. */
export const FALLBACK_ICON = 'star';

/** Đường vẽ SVG (viewBox 24x24, nét đơn) lấy nguyên từ PWA. */
export const ICON_PATHS: Readonly<Record<string, string>> = {
  food: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M9 4v3M12 3v4M15 4v3"/>',
  fun: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  shop: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0"/>',
  trip: '<path d="M3 12l18-8-6 17-3-7-9-2Z"/>',
  move: '<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16l4-7h4l4 7M10 9 9 6H7"/>',
  bill: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  health: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
  edu: '<path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4V5ZM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6V5Z"/>',
  home: '<path d="M4 11l8-7 8 7v9H4v-9Z"/><path d="M10 20v-5h4v5"/>',
  pet: '<circle cx="7" cy="10" r="1.5"/><circle cx="10.5" cy="6.5" r="1.5"/><circle cx="14.5" cy="6.5" r="1.5"/><circle cx="18" cy="10" r="1.5"/><path d="M8 17c0-2.5 2-5 4.5-5s4.5 2.5 4.5 5c0 2-2 2.5-4.5 2.5S8 19 8 17Z"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z"/><path d="M16 10h2a2 2 0 0 1 0 5h-2M8 3v3M12 3v3"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  shirt: '<path d="M8 4 3 7l2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 0 1-8 0Z"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4H4Z"/><circle cx="8" cy="16.5" r="1.5"/><circle cx="16" cy="16.5" r="1.5"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M14.5 9.5h-3.5a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H9.5"/>',
  sport: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  plant: '<path d="M12 20v-8M12 12c0-4-3-6-7-6 0 4 3 6 7 6ZM12 14c0-3 2.5-5 7-5 0 3.5-3 5-7 5Z"/>',
  spark: '<path d="M10 4l1.5 4.5L16 10l-4.5 1.5L10 16l-1.5-4.5L4 10l4.5-1.5L10 4ZM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
  other: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
};
