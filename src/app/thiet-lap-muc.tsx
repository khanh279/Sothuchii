import { Stack, useLocalSearchParams } from 'expo-router';

import SettingsScreen, { SETTINGS_ITEMS } from '@/features/expenses/SettingsScreen';

/** Trang riêng của một mục Thiết lập (tham số `muc`); mục không hợp lệ thì hiện lại danh sách. */
export default function SettingsItemRoute() {
  const { muc } = useLocalSearchParams<{ muc?: string }>();
  const item = SETTINGS_ITEMS.find((entry) => entry.key === muc);
  return (
    <>
      <Stack.Screen options={{ title: item?.title ?? 'Thiết lập', headerShown: false }} />
      <SettingsScreen view={item?.key} />
    </>
  );
}
