import { router as expoRouter, type Href } from 'expo-router';

import { createNavGuard } from '@/utils/nav-guard';

/** Hai lần bấm cách nhau dưới khoảng này (màn hình mở chậm nên bấm lại) chỉ tính một lần điều hướng. */
const NAV_GUARD_MS = 800;
const allow = createNavGuard(NAV_GUARD_MS);

const keyOf = (href: Href): string => (typeof href === 'string' ? href : JSON.stringify(href));

/**
 * Bộ điều hướng dùng thay cho `router` của expo-router trong toàn app: `push`, `replace` và `back` bỏ qua lần gọi lặp cùng đích trong ${NAV_GUARD_MS}ms để bấm đúp
 * (hoặc bấm lại khi trang đang mở chậm) không mở trang hai lần hay lùi hai trang. `canGoBack` giữ nguyên.
 */
export const router = {
  push: (href: Href) => {
    if (allow(`push:${keyOf(href)}`)) expoRouter.push(href);
  },
  replace: (href: Href) => {
    if (allow(`replace:${keyOf(href)}`)) expoRouter.replace(href);
  },
  back: () => {
    if (allow('back')) expoRouter.back();
  },
  canGoBack: () => expoRouter.canGoBack(),
};
