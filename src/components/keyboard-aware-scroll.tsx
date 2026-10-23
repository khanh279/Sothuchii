import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode, type Ref } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

import { useSwipeLocked } from '@/hooks/use-swipe-lock';

type Props = ScrollViewProps & { ref?: Ref<ScrollView> };

/**
 * Khoảng chừa giữa đáy nút và mép trên bàn phím (dp). Android / web: chừa đủ cho thanh gợi ý số (cao 57) cộng thêm lề để nút không bị thanh che khi gợi ý hiện;
 * iOS: gợi ý nằm trong thanh phụ của bàn phím (đã tính vào chiều cao bàn phím) nên chỉ cần lề nhỏ.
 */
const GAP = Platform.OS === 'ios' ? 24 : 57 + 24;

const AnchorContext = createContext<MutableRefObject<View | null> | null>(null);

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
export function KeyboardAwareScrollView({ ref: externalRef, onLayout, onScroll, keyboardShouldPersistTaps = 'handled', scrollEnabled = true, children, ...rest }: Props) {
  // Đang vuốt ngang một ô trượt (vd. chuyển lớp Hệ số ở Chia bill) thì tạm tắt cuộn dọc: chỉ cử chỉ dọc mới cuộn.
  const swipeLocked = useSwipeLocked();
  const scrollRef = useRef<ScrollView | null>(null);
  const anchorRef = useRef<View | null>(null);
  const offset = useRef(0);
  const opened = useRef(false);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    const scrollToFocusedInput = () => {
      const input = TextInput.State.currentlyFocusedInput?.();
      const scroll = scrollRef.current;
      // `measureLayout` cần tham chiếu tới thành phần native (getInnerViewNode có thể trả mã số, gây cảnh báo); ô nằm ngoài ScrollView (vd. thẻ nhập số trong hộp thoại) thì bỏ qua.
      const inner = (scroll as (ScrollView & { getInnerViewRef?: () => unknown }) | null)?.getInnerViewRef?.();
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
        // Chờ một khung hình để khoảng đệm cuối nội dung được dựng rồi mới cuộn (đảm bảo đủ chỗ cuộn).
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: offset.current + need, animated: true }));
      });
    };
    const onHide = () => {
      opened.current = false;
      setExtra(0);
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
          else if (externalRef) (externalRef as MutableRefObject<ScrollView | null>).current = node;
        }}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        scrollEnabled={scrollEnabled && !swipeLocked}
        scrollEventThrottle={16}
        onLayout={onLayout}
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
