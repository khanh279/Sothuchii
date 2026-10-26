import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode, type Ref } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View, type HostInstance, type ScrollViewInstance, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

import { AMOUNT_SUGGEST_BAR_HEIGHT } from '@/components/amount-suggest';
import { useSwipeLocked } from '@/hooks/use-swipe-lock';

type Props = ScrollViewProps & { ref?: Ref<ScrollViewInstance> };

/**
 * Khoảng chừa giữa đáy nút và mép trên bàn phím (dp): đủ cho thanh gợi ý số tiền (cao `AMOUNT_SUGGEST_BAR_HEIGHT`) cộng thêm lề để nút không bị thanh che khi gợi ý hiện.
 * Mọi nền tảng như nhau: từ RN 0.88 thanh gợi ý không còn nằm trong thanh phụ của bàn phím iOS mà do `KeyboardAvoid` vẽ sát trên bàn phím (xem `amount-suggest.tsx`).
 */
const GAP = AMOUNT_SUGGEST_BAR_HEIGHT + 1 + 24;

const AnchorContext = createContext<MutableRefObject<HostInstance | null> | null>(null);

/**
 * Đánh dấu nút Lưu / Ghi nhận của biểu mẫu để `KeyboardAwareScrollView` giữ nó không bị bàn phím che. Bọc đúng nút (hoặc hàng chứa nút);
 * ngoài `KeyboardAwareScrollView` thì chỉ là một `View` thường.
 */
export function KeyboardAnchor({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ref = useContext(AnchorContext);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

/**
 * ScrollView của biểu mẫu. Khi bàn phím chữ / số hiện ra: nếu nút Lưu / Ghi nhận (bọc bằng `KeyboardAnchor`) đang bị bàn phím che hoặc sát mép thì cuộn đúng
 * một đoạn để đáy nút nằm ngay trên bàn phím (thêm khoảng đệm cuối nội dung nếu chưa đủ chỗ cuộn); nếu nút đã nằm trên bàn phím thì không làm gì.
 * Không có nút đánh dấu thì cuộn để ô đang gõ nằm trong tầm nhìn. Khi bàn phím đóng, bỏ khoảng đệm. Khung ngoài (`KeyboardAvoid`) vẫn lo nâng đáy trang.
 */
export function KeyboardAwareScrollView({ ref: externalRef, onLayout, onScroll, onContentSizeChange, keyboardShouldPersistTaps = 'handled', scrollEnabled = true, children, ...rest }: Props) {
  // Đang vuốt ngang một ô trượt (vd. chuyển lớp Hệ số ở Chia bill) thì tạm tắt cuộn dọc: chỉ cử chỉ dọc mới cuộn.
  const swipeLocked = useSwipeLocked();
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const anchorRef = useRef<HostInstance | null>(null);
  const offset = useRef(0);
  /** Vị trí cuộn cần tới (đáy nút Lưu nằm trên bàn phím) đang chờ khoảng đệm cuối nội dung dựng xong; null = không có việc chờ. */
  const pending = useRef<number | null>(null);
  const flushPending = (clear: boolean) => {
    if (pending.current === null) return;
    scrollRef.current?.scrollTo({ y: pending.current, animated: true });
    if (clear) pending.current = null;
  };
  const opened = useRef(false);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    const scrollToFocusedInput = () => {
      const input = TextInput.State.currentlyFocusedInput?.();
      const scroll = scrollRef.current;
      // `measureLayout` cần tham chiếu tới thành phần native (getInnerViewNode có thể trả mã số, gây cảnh báo); ô nằm ngoài ScrollView (vd. thẻ nhập số trong hộp thoại) thì bỏ qua.
      const inner = (scroll as (ScrollViewInstance & { getInnerViewRef?: () => unknown }) | null)?.getInnerViewRef?.();
      if (!input || !scroll || !inner) return;
      try {
        input.measureLayout(inner as never, (_x, y) => scroll.scrollTo({ y: Math.max(0, y - 120), animated: true }), () => undefined);
      } catch {
        // ô đang gõ không thuộc ScrollView này
      }
    };

    const onShow = (event: { endCoordinates: { screenY: number } }) => {
      // Bàn phím đã mở và đang ở yên (sự kiện lặp, ví dụ khi thanh gợi ý đổi): không cuộn lại, giữ khung cố định.
      if (opened.current) return;
      opened.current = true;
      const keyboardTop = event.endCoordinates.screenY;
      // Đo NGAY khi bàn phím bắt đầu hiện (khung chứa co lại không làm nút dịch chỗ vì nội dung neo ở đỉnh), rồi cuộn cùng nhịp với bàn phím
      // (iOS: `keyboardWillShow` nên cuộn có hoạt hoá chạy song song với chuyển động bàn phím).
      const anchor = anchorRef.current;
      if (!anchor) {
        setTimeout(scrollToFocusedInput, 60);
        return;
      }
      anchor.measureInWindow((_x, y, _w, height) => {
        const need = y + height + GAP - keyboardTop;
        if (need <= 0) return; // nút đã nằm trên bàn phím: không cần cuộn
        setExtra(need);
        // Khoảng đệm cuối nội dung chỉ có sau khi dựng lại: cuộn ngay khi nội dung đổi kích thước (`onContentSizeChange`); nếu sự kiện đó không tới (nội dung đã đủ dài) thì cuộn ở khung hình kế và sau một nhịp ngắn.
        pending.current = offset.current + need;
        requestAnimationFrame(() => flushPending(false));
        setTimeout(() => flushPending(true), 250);
      });
    };
    const onHide = () => {
      opened.current = false;
      setExtra(0);
      pending.current = null;
    };

    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <AnchorContext.Provider value={anchorRef}>
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
    </AnchorContext.Provider>
  );
}
