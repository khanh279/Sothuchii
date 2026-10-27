import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { OptionSheet, type SheetOption } from '@/components/option-sheet';
import { SvgIcon } from '@/components/svg-icon';
import { useColors } from '@/hooks/use-colors';
import { setLanguage, useLanguage } from '@/i18n/language';
import { withAlpha } from '@/utils/color';

/**
 * Nút bánh răng "Cài đặt" của ứng dụng: bấm mở menu hai mục có biểu tượng. (1) Thiết lập: mở trang thiết lập. (2) Đổi ngôn ngữ: viết bằng CHÍNH NGÔN NGỮ SẼ ĐỔI SANG
 * (đang tiếng Việt thì ghi "Switch to English", đang tiếng Anh thì ghi "Chuyển sang Tiếng Việt"), vì người cần đổi thường không đọc được ngôn ngữ đang hiện; chuỗi không nằm trong từ điển dịch
 * nên không bị dịch theo ngôn ngữ hiện tại. Bấm là đổi ngay.
 * `hero`: nút tròn 34px nền mờ + viền sáng mảnh, đặt ở góc phải thẻ "Tổng chi tiêu" nền navy. `plain`: nút tròn 44px nền trắng + viền xám, dùng khi thẻ đó không hiện (lỗi tải dữ liệu)
 * để vẫn vào được Thiết lập (sao lưu / khôi phục).
 */
export function SettingsMenuButton({ variant = 'hero' }: { variant?: 'hero' | 'plain' }) {
  const colors = useColors();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const hero = variant === 'hero';

  const menu: SheetOption[] = [
    { icon: 'gear', label: 'Thiết lập', onPress: () => router.push('/thiet-lap') },
    { icon: 'globe', label: language === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt', onPress: () => setLanguage(language === 'vi' ? 'en' : 'vi') },
  ];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cài đặt"
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          hero ? styles.hero : styles.plain,
          hero ? { backgroundColor: colors.heroTrack, borderColor: withAlpha(colors.heroInk, 0.32) } : { backgroundColor: colors.surface, borderColor: colors.line },
          { opacity: pressed ? 0.75 : 1 },
        ]}>
        <SvgIcon name="gear" size={hero ? 20 : 24} color={hero ? colors.heroInk : colors.primary} strokeWidth={1.9} />
      </Pressable>
      {open && <OptionSheet title="Cài đặt" options={menu} onClose={() => setOpen(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  plain: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
