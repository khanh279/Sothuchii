import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';

import { initialChromeScroll, stepChromeScroll } from '@/domain/scrollChrome';

interface ChromeValue {
  /** Thanh tab dưới và nút "+ Chi tiêu" đang ẩn (do cuộn xuống nhanh). */
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  /** Màn hình đang hiện đăng ký cách cuộn về đầu trang; trả về hàm huỷ đăng ký. */
  registerTop: (scrollToTop: () => void) => () => void;
  /** Cuộn màn hình đang hiện (đăng ký sau cùng) về đầu trang. */
  scrollToTop: () => void;
}

const noop = () => {};
const DEFAULT: ChromeValue = { hidden: false, setHidden: noop, registerTop: () => noop, scrollToTop: noop };
const ChromeContext = createContext<ChromeValue>(DEFAULT);

/** Trạng thái dùng chung cho thanh tab dưới, nút nổi và việc chạm tab đang đứng để cuộn về đầu (như `#stNav` của PWA). */
export function ChromeProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const tops = useRef<(() => void)[]>([]);
  const value = useMemo<ChromeValue>(
    () => ({
      hidden,
      setHidden,
      registerTop: (scrollToTop) => {
        tops.current.push(scrollToTop);
        return () => {
          tops.current = tops.current.filter((fn) => fn !== scrollToTop);
        };
      },
      scrollToTop: () => tops.current[tops.current.length - 1]?.(),
    }),
    [hidden],
  );
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export const useChrome = () => useContext(ChromeContext);

/**
 * Gắn vào `ScrollView` của một trang chính: `const { ref, props } = useChromeScroll();` rồi `<ScrollView ref={ref} {...props} />`.
 * Cuộn xuống nhanh thì ẩn thanh dưới + nút nổi, cuộn lên / cuộn chậm / về đầu hoặc cuối trang thì hiện lại (`stepChromeScroll`).
 * Chạm tab đang đứng thì trang này cuộn về đầu. Truyền `enabled = false` cho trang mở riêng (không có thanh dưới).
 */
export function useChromeScroll(enabled = true) {
  const { setHidden, registerTop } = useChrome();
  const ref = useRef<ScrollViewInstance>(null);
  const state = useRef(initialChromeScroll);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enabled) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      state.current = stepChromeScroll(state.current, {
        y: contentOffset.y,
        t: Date.now(),
        maxY: Math.max(0, contentSize.height - layoutMeasurement.height),
      });
      setHidden(state.current.hidden);
    },
    [enabled, setHidden],
  );

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      return registerTop(() => ref.current?.scrollTo({ y: 0, animated: true }));
    }, [enabled, registerTop]),
  );

  const props = useMemo(() => ({ onScroll, scrollEventThrottle: 16 }), [onScroll]);
  return { ref, props };
}
