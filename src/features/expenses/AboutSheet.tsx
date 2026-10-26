import { StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { SheetFrame, SheetHeader } from '@/components/sheet-frame';
import { useColors } from '@/hooks/use-colors';

/** Tờ nổi mô tả sản phẩm (mở bằng nút "i" ở trang Thiết lập). Nội dung mô tả sẽ được bổ sung sau. */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  return (
    <SheetFrame onClose={onClose}>
      <SheetHeader title="Giới thiệu" />
      <AppText color={colors.muted} style={styles.body}>
        Nội dung giới thiệu sản phẩm sẽ được bổ sung sau.
      </AppText>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22, paddingTop: 10, paddingBottom: 8 },
});
