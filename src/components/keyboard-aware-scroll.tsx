import { useEffect, useRef, useState, type MutableRefObject, type Ref } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';

import { AMOUNT_SUGGEST_BAR_HEIGHT } from '@/components/amount-suggest';
import { useSwipeLocked } from '@/hooks/use-swipe-lock';
import { onInputFocus } from '@/utils/input-focus';

type Props = ScrollViewProps & { ref?: Ref<ScrollViewInstance> };

/**
 * Khoảng chừa giữa đáy ô nhập và mép bàn phím (dp): thanh gợi ý số tiền (cao `AMOUNT_SUGGEST_BAR_HEIGHT`) nằm sát trên bàn phím nên ô được đưa lên sát MÉP TRÊN của thanh gợi ý, cộng thêm một chút lề.
 * Mọi nền tảng như nhau: từ RN 0.88 thanh gợi ý do `KeyboardAvoid` vẽ sát trên bàn phím (xem `amount-suggest.tsx`).
 */
const GAP = AMOUNT_SUGGEST_BAR_HEIGHT + 8;

/**
 * ScrollView của biểu mẫu / trang có ô nhập. Khi bàn phím chữ / số hiện ra, hoặc khi người dùng chuyển sang ô khác lúc bàn phím đang mở: nếu ô đang chọn bị bàn phím (cùng thanh gợi ý số tiền) che hoặc sát mép
 * thì cuộn đúng một đoạn để đáy ô nằm ngay trên mép trên của khung gợi ý (thêm khoảng đệm cuối nội dung nếu chưa đủ chỗ cuộn); ô đã nhìn thấy đầy đủ thì không làm gì.
 * Nút Lưu không được giữ trên bàn phím. Khi bàn phím đóng, bỏ khoảng đệm. Khung ngoài (`KeyboardAvoid`) vẫn lo nâng đáy trang.
 */
export function KeyboardAwareScrollView({ ref: externalRef, onLayout, onScroll, onContentSizeChange, keyboardShouldPersistTaps = 'handled', scrollEnabled = true, children, ...rest }: Props) {
  // Đang vuốt ngang một ô trượt (vd. chuyển lớp Hệ số ở Chia bill) thì tạm tắt cuộn dọc: chỉ cử chỉ dọc mới cuộn.
  const swipeLocked = useSwipeLocked();
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const offset = useRef(0);
  /** Vị trí cuộn cần tới (đáy ô nằm trên khung gợi ý) đang chờ khoảng đệm cuối nội dung dựng xong; null = không có việc chờ. */
  const pending = useRef<number | null>(null);
  const flushPending = (clear: boolean) => {
    if (pending.current === null) return;
    scrollRef.current?.scrollTo({ y: pending.current, animated: true });
    if (clear) pending.current = null;
  };
  /** Mép trên của bàn phím (toạ độ màn hình) khi đang mở; null = bàn phím đóng. */
  const keyboardTop = useRef<number | null>(null);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    /** Đưa ô đang chọn lên khỏi vùng bàn phím che nếu cần. Ô không thuộc ScrollView này (vd. ô trong hộp thoại) thì bỏ qua. */
    const reveal = () => {
      const input = TextInput.State.currentlyFocusedInput?.();
      const scroll = scrollRef.current;
      const top = keyboardTop.current;
      // `measureLayout` cần tham chiếu tới thành phần native (getInnerViewNode có thể trả mã số, gây cảnh báo).
      const inner = (scroll as (ScrollViewInstance & { getInnerViewRef?: () => unknown }) | null)?.getInnerViewRef?.();
      if (!input || !scroll || !inner || top === null) return;
      try {
        input.measureLayout(
          inner as never,
          () => {
            // Chỉ tới đây khi ô nằm trong ScrollView này; đo vị trí thật của ô trong cửa sổ để so với mép bàn phím.
            input.measureInWindow((_x, y, _w, height) => {
              const need = y + height + GAP - top;
              if (need <= 0) return; // ô đã nằm trên khung gợi ý: không cần cuộn
              setExtra((prev) => Math.max(prev, need));
              // Khoảng đệm cuối nội dung chỉ có sau khi dựng lại: cuộn ngay khi nội dung đổi kích thước (`onContentSizeChange`); nếu sự kiện đó không tới thì cuộn ở khung hình kế và sau một nhịp ngắn.
              pending.current = offset.current + need;
              requestAnimationFrame(() => flushPending(false));
              setTimeout(() => flushPending(true), 250);
            });
          },
          () => undefined,
        );
      } catch {
        // ô đang gõ không thuộc ScrollView này
      }
    };

    const onShow = (event: { endCoordinates: { screenY: number } }) => {
      keyboardTop.current = event.endCoordinates.screenY;
      // Đo ngay khi bàn phím bắt đầu hiện (iOS: `keyboardWillShow` nên cuộn có hoạt hoá chạy song song với chuyển động bàn phím).
      reveal();
      setTimeout(reveal, 60);
    };
    const onHide = () => {
      keyboardTop.current = null;
      setExtra(0);
      pending.current = null;
    };

    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    // Chuyển sang ô khác lúc bàn phím đang mở (bàn phím không hiện lại nên không có sự kiện bàn phím).
    const unsubscribeFocus = onInputFocus(() => {
      if (keyboardTop.current !== null) setTimeout(reveal, 30);
    });
    return () => {
      show.remove();
      hide.remove();
      unsubscribeFocus();
    };
  }, []);

  return (
    <ScrollView
      ref={(node) => {
        scrollRef.current = node;
        if (typeof externalRef === 'function') externalRef(node);
        else if (externalRef) (externalRef as MutableRefObject<ScrollViewInstance | null>).current = node;
      }}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      scrollEnabled={scrollEnabled && !swipeLocked}
      scrollEventThrottle={16}
      onLayout={onLayout}
      onContentSizeChange={(width, height) => {
        flushPending(true);
        onContentSizeChange?.(width, height);
      }}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      }}
      {...rest}>
      {children}
      {extra > 0 && <View style={{ height: extra }} />}
    </ScrollView>
  );
}
