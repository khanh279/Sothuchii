import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ModalPresence } from '@/components/modal-presence';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

const USE_NATIVE = Platform.OS !== 'web';
/** Độ cao xuất phát (dp) của tờ khi trượt lên: đủ lớn để nằm ngoài màn hình kể cả tờ cao. */
const SHEET_OFFSET = 640;
const OPEN_MS = 180;
const CLOSE_MS = 160;
/** Chuyển giữa hai tờ (tờ cũ xuống, tờ mới hiện) và thẻ ở giữa: nhanh hơn để không thấy chờ. */
const QUICK_MS = 110;
/** Thẻ ở giữa dời lên cao hơn tâm màn hình một đoạn (dp) bằng đệm đáy gấp đôi: bàn phím hiện khi nhập số không che hai nút Huỷ / Xác nhận. */
const CENTER_LIFT = 200;
/** Thẻ ở giữa hiện tại chỗ: mờ dần và phóng từ cỡ này lên 1 (không trượt từ xa lên nên nhanh và gọn). */
const CENTER_SCALE_FROM = 0.92;
/** Thời gian (ms) nền mờ còn được giữ nguyên cho tờ kế tiếp: đủ cho tờ cũ trượt xuống rồi tờ mới dựng. */
const HOLD_SCRIM_MS = 700;

let holdScrimUntil = 0;

function consumeHeldScrim(): boolean {
  const held = Date.now() < holdScrimUntil;
  holdScrimUntil = 0;
  return held;
}

type CloseSheet = (after?: () => void, keepScrim?: boolean) => void;

const SheetCloseContext = createContext<CloseSheet>(() => undefined);

/** Hàm đóng tờ hiện tại có hiệu ứng (nền sáng lại, tờ trượt xuống) rồi mới gỡ tờ và chạy `after`. `keepScrim` = true khi `after` mở một tờ khác: nền mờ đứng yên suốt lúc đổi tờ, chỉ tờ trượt xuống rồi tờ mới trượt lên. Gọi trong nội dung của `SheetFrame`. */
export function useSheetClose(): CloseSheet {
  return useContext(SheetCloseContext);
}

/** Đầu tờ chuẩn: chỉ có tiêu đề (không nút X; đóng bằng chạm nền mờ hoặc nút Back, thẻ bước có nút Huỷ). */
export function SheetHeader({ title }: { title: string }) {
  return (
    <AppText weight="bold" style={styles.title} accessibilityRole="header" numberOfLines={2}>
      {title}
    </AppText>
  );
}

interface Props {
  /** Gọi sau khi tờ đã đóng xong để nơi chứa gỡ tờ khỏi màn hình. */
  onClose: () => void;
  /** 'bottom' (mặc định): tờ trượt từ đáy lên; 'center': thẻ hiện tại chỗ (mờ dần, phóng nhẹ) ở giữa màn hình. */
  placement?: 'bottom' | 'center';
  /** Mọi lần đóng đều giữ nguyên nền mờ (dùng khi đóng tờ này để hiện lại một tờ khác ngay sau đó). */
  keepScrim?: boolean;
  /** Giới hạn chiều cao của tờ (mặc định 88%). */
  maxHeight?: `${number}%`;
  children: ReactNode;
}

/**
 * Khung tờ nổi DUY NHẤT của ứng dụng (cách xuất hiện giống nút "+" ở Tổng quan): nền mờ sáng dần, tờ trượt lên từ đáy kèm tay nắm; đóng thì tờ trượt xuống, nền sáng lại rồi mới gỡ.
 * Chỉ một Modal và không né bàn phím. Nội dung do nơi dùng đặt vào (tiêu đề, danh sách, biểu mẫu); đóng bằng useSheetClose, chạm nền hoặc nút Back.
 * Chọn một mục để mở tờ KHÁC (hide với keepScrim): nền mờ giữ nguyên, tờ cũ trượt xuống rồi tờ mới hiện ra từ từ bằng đúng hiệu ứng mở, chỉ tờ thay đổi.
 */
export function SheetFrame({ onClose, placement = 'bottom', keepScrim: keepScrimByDefault = false, maxHeight = '88%', children }: Props) {
  const centered = placement === 'center';
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  /** Độ đậm của nền mờ: riêng với tờ, để đổi tờ thì nền không sáng lên rồi tối lại. */
  const [scrim] = useState(() => new Animated.Value(consumeHeldScrim() ? 1 : 0));

  useEffect(() => {
    const duration = centered ? QUICK_MS : OPEN_MS;
    Animated.timing(progress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }).start();
    Animated.timing(scrim, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }).start();
  }, [progress, scrim, centered]);

  /** Đóng (trượt xuống, nền sáng lại) rồi mới gỡ khỏi màn hình; after chạy sau khi đã đóng (hẹn giờ, không phụ thuộc khung hình). */
  function hide(after?: () => void, keepScrim = keepScrimByDefault) {
    const duration = keepScrim || centered ? QUICK_MS : CLOSE_MS;
    Animated.timing(progress, { toValue: 0, duration, easing: Easing.in(Easing.cubic), useNativeDriver: USE_NATIVE }).start();
    if (keepScrim) holdScrimUntil = Date.now() + HOLD_SCRIM_MS;
    else Animated.timing(scrim, { toValue: 0, duration, easing: Easing.in(Easing.cubic), useNativeDriver: USE_NATIVE }).start();
    setTimeout(() => {
      onClose();
      after?.();
    }, duration + 20);
  }

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={() => hide()}>
      <ModalPresence />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Đóng" onPress={() => hide()} />
      </Animated.View>
      <View style={[styles.host, centered ? { justifyContent: 'center', paddingHorizontal: 20, paddingBottom: CENTER_LIFT } : null]} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            centered ? styles.sheetCentered : null,
            {
              maxHeight,
              backgroundColor: colors.surface,
              paddingBottom: centered ? 16 : 16 + insets.bottom,
              ...(centered
                ? { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [CENTER_SCALE_FROM, 1] }) }] }
                : { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [SHEET_OFFSET, 0] }) }] }),
            },
          ]}
        >
          {!centered && <View style={[styles.handle, { backgroundColor: colors.line }]} />}
          <SheetCloseContext.Provider value={hide}>{children}</SheetCloseContext.Provider>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, lineHeight: 26 },
  host: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: AppRadius.hero, borderTopRightRadius: AppRadius.hero, paddingHorizontal: 16, paddingTop: 10 },
  sheetCentered: { borderRadius: AppRadius.hero, paddingTop: 16 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
});
