import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { OptionSheet, type SheetOption } from '@/components/option-sheet';
import { pressStyle } from '@/components/press-feedback';
import { SvgIcon } from '@/components/svg-icon';
import { useColors } from '@/hooks/use-colors';
import { setLanguage, useLanguage } from '@/i18n/language';
import { router } from '@/utils/safe-router';

/**
 * Nút bánh răng "Cài đặt" của ứng dụng: bấm mở menu hai mục có biểu tượng. (1) Thiết lập: mở trang thiết lập. (2) Đổi ngôn ngữ: viết bằng CHÍNH NGÔN NGỮ SẼ ĐỔI SANG
 * (đang tiếng Việt thì ghi "Switch to English", đang tiếng Anh thì ghi "Chuyển sang Tiếng Việt"), vì người cần đổi thường không đọc được ngôn ngữ đang hiện; chuỗi không nằm trong từ điển dịch
 * nên không bị dịch theo ngôn ngữ hiện tại. Bấm là đổi ngay.
 * Nút tròn 40px nền trắng + viền xám nằm ở góc phải, ngang hàng tiêu đề "Tổng quan" (luôn hiện, kể cả khi dữ liệu lỗi nên vẫn vào được Thiết lập: sao lưu / khôi phục).
 */
export function SettingsMenuButton() {
  const colors = useColors();
  const language = useLanguage();
  const [open, setOpen] = useState(false);

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
        style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, borderColor: colors.line }, pressStyle(pressed)]}>
        <SvgIcon name="gear" size={22} color={colors.primary} strokeWidth={1.9} />
      </Pressable>
      {open && <OptionSheet title="Cài đặt" options={menu} onClose={() => setOpen(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
