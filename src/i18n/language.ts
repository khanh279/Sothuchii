import { useSyncExternalStore } from 'react';

import { translate, type Language } from '@/i18n/translate';

/** Kho lưu trữ nạp muộn: các thẻ chữ dùng tệp này ở khắp nơi nên không kéo AsyncStorage vào mọi bài kiểm thử / màn hình chỉ cần dịch chữ. */
const storage = () => import('@/data/storage');

let current: Language = 'vi';
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Đổi ngôn ngữ ngay (mọi chữ đang hiện dịch lại) và ghi nhớ trên máy. */
export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  listeners.forEach((listener) => listener());
  void storage().then(({ StorageKeys, saveJson }) => saveJson(StorageKeys.language, language));
}

/** Đọc ngôn ngữ đã chọn khi mở app (chưa chọn thì tiếng Việt). */
export async function loadLanguage(): Promise<Language> {
  const { StorageKeys, loadJson } = await storage();
  const saved = await loadJson<string>(StorageKeys.language, 'vi');
  current = saved === 'en' ? 'en' : 'vi';
  listeners.forEach((listener) => listener());
  return current;
}

/** Ngôn ngữ hiện tại; màn hình dùng hook này sẽ vẽ lại khi đổi ngôn ngữ. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

/** Dịch một chuỗi theo ngôn ngữ hiện tại (dùng ngoài thẻ chữ: placeholder, nhãn, thông báo…). Gọi `useLanguage()` ở màn hình để vẽ lại khi đổi. */
export function tr(text: string): string {
  return translate(text, current);
}
