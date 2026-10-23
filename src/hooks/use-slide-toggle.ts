import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, type LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import { slideProgress, slideSettle } from '@/domain/swipe';
import { setSwipeLock } from '@/hooks/use-swipe-lock';

/** Quãng ngang (px) để cử chỉ được nhận là vuốt NGANG; vuốt dọc quá quãng này trước thì cử chỉ bỏ qua để biểu mẫu cuộn dọc. */
const ACTIVE_OFFSET_X = 6;
const FAIL_OFFSET_Y = 14;

/**
 * Cử chỉ vuốt ngang chuyển qua lại giữa hai lớp (Chia bill: "Tên + Số tiền chi" ↔ "Hệ số hoặc Số tiền cố định").
 * Dùng `Gesture.Pan` của react-native-gesture-handler: cử chỉ chỉ kích hoạt khi ngón tay đi ngang trước (`activeOffsetX`) và tự bỏ khi đi dọc trước
 * (`failOffsetY`), nên cuộn dọc của biểu mẫu và vuốt ngang không giành nhau (hệ điều hành phân xử, kể cả khi bắt đầu vuốt trên ô nhập).
 * `progress` chạy liên tục 0 → 1 theo ngón tay (0 = lớp đầu, 1 = lớp thứ hai): hai lớp ghép liền nhau trượt cùng lúc; thả tay thì chốt về phía gần hơn
 * (hoặc theo vận tốc) rồi báo cho cha qua `onChange`. `open` do cha giữ để chỉ một dòng mở và để nút × điều khiển cùng cơ chế.
 * Trong lúc kéo, cuộn dọc của biểu mẫu tạm tắt (`setSwipeLock`).
 */
export function useSlideToggle(open: boolean, onChange: (open: boolean) => void) {
  const [progress] = useState(() => new Animated.Value(0));
  const value = useRef(0);
  const start = useRef(0);
  // Bề rộng khung (px) chỉ dùng để đổi quãng kéo (px) thành tiến độ; phép dịch dùng phần trăm nên đúng ngay từ khung hình đầu, trước khi đo xong.
  const measured = useRef(0);
  const live = useRef({ open, onChange });
  /** Ô này đang giữ khoá cuộn của biểu mẫu (đang kéo ngang). */
  const holdsLock = useRef(false);
  const [nameX] = useState(() => progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '-100%'] }));
  const [slideInX] = useState(() => progress.interpolate({ inputRange: [0, 1], outputRange: ['100%', '0%'] }));

  useEffect(() => {
    live.current = { open, onChange };
  });

  useEffect(() => {
    const id = progress.addListener((state) => {
      value.current = state.value;
    });
    return () => progress.removeListener(id);
  }, [progress]);

  // Đang kéo mà ô bị gỡ khỏi màn hình thì nhả khoá cuộn, kẻo biểu mẫu bị kẹt.
  useEffect(
    () => () => {
      if (holdsLock.current) setSwipeLock(false);
    },
    [],
  );

  useEffect(() => {
    animate(progress, open ? 1 : 0);
  }, [progress, open]);

  const release = (dx: number, vxPerSecond: number) => {
    if (holdsLock.current) {
      holdsLock.current = false;
      setSwipeLock(false);
    }
    const target = slideSettle(slideProgress(start.current, dx, measured.current), vxPerSecond / 1000);
    animate(progress, target);
    live.current.onChange(target === 1);
  };

  // Chỉ đọc `live` / `start` bên trong callback cử chỉ (không phải lúc render); luật refs không phân biệt được điều này.
  // eslint-disable-next-line react-hooks/refs
  const [gesture] = useState(() =>
    Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
      .failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
      .onStart(() => {
        holdsLock.current = true;
        setSwipeLock(true);
        progress.stopAnimation();
        start.current = value.current;
      })
      .onUpdate((event) => progress.setValue(slideProgress(start.current, event.translationX, measured.current)))
      .onEnd((event) => release(event.translationX, event.velocityX))
      .onFinalize((_event, success) => {
        // Cử chỉ bị huỷ (ví dụ hệ thống ngắt) mà chưa chốt: trả về lớp đang mở và nhả khoá cuộn.
        if (success || !holdsLock.current) return;
        holdsLock.current = false;
        setSwipeLock(false);
        animate(progress, live.current.open ? 1 : 0);
      }),
  );

  return {
    /** Dịch ngang của lớp 1 (trượt ra trái: 0 → -100%) và lớp 2 (trượt vào từ phải: 100% → 0). */
    nameX,
    slideInX,
    /** Cử chỉ vuốt: bọc khung bằng `GestureDetector gesture={gesture}`. */
    gesture,
    onLayout: (event: LayoutChangeEvent) => {
      measured.current = event.nativeEvent.layout.width;
    },
  };
}

function animate(progress: Animated.Value, to: number) {
  Animated.timing(progress, { toValue: to, duration: 220, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: Platform.OS !== 'web' }).start();
}
