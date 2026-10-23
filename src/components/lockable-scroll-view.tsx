import { forwardRef, useRef, useState } from 'react';
import { ScrollView, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native';

import { useSwipeLocked } from '@/hooks/use-swipe-lock';

/** Cuộn xa hơn mức này (dp) thì coi là "đang cuộn xuống" và giữ chiều cao nội dung; về lại đầu trang thì thả. */
const HOLD_FROM_OFFSET = 2;

/**
 * `ScrollView` dùng cho các danh sách có dòng vuốt Sửa / Xoá: trong lúc một dòng đang được vuốt ngang thì tắt cuộn dọc (`useSwipeLocked`), nên chỉ
 * cử chỉ dọc mới cuộn trang. Mọi thuộc tính và `ref` giữ nguyên như `ScrollView`.
 *
 * Chống "trang bị đẩy lên" khi đổi thẻ lọc ở các trang lịch sử: danh sách ngắn lại thì nội dung ngắn hơn vị trí đang cuộn, hệ điều hành kẹp vị trí cuộn lại
 * (giữ mép dưới) làm khung phía trên bị kéo lên. Nên khi đang cuộn xuống (cách đầu trang quá `HOLD_FROM_OFFSET`) ta giữ chiều cao nội dung ở mức lớn nhất đã có
 * (`minHeight`): danh sách ngắn lại thì chỉ phần phía dưới co lại (để trống), khung phía trên đứng yên. Về lại đầu trang thì thả, trang trở về chiều cao thật.
 */
export const LockableScrollView = forwardRef<ScrollView, ScrollViewProps>(function LockableScrollView(
  { scrollEnabled = true, contentContainerStyle, onScroll, onContentSizeChange, scrollEventThrottle = 16, ...rest },
  ref,
) {
  const locked = useSwipeLocked();
  /** Chiều cao nội dung nhỏ nhất đang giữ (0 = không giữ). */
  const [holdHeight, setHoldHeight] = useState(0);
  const contentHeight = useRef(0);
  const offset = useRef(0);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    offset.current = event.nativeEvent.contentOffset.y;
    // Chiều cao nội dung lấy luôn từ sự kiện cuộn (có trên mọi nền tảng, kể cả web).
    if (event.nativeEvent.contentSize?.height) contentHeight.current = event.nativeEvent.contentSize.height;
    // Chỉ đổi state khi vượt ngưỡng (không dựng lại theo từng khung hình cuộn).
    setHoldHeight((held) => (offset.current > HOLD_FROM_OFFSET ? (held === 0 ? contentHeight.current : held) : 0));
    onScroll?.(event);
  }

  function handleContentSize(width: number, height: number) {
    contentHeight.current = height;
    // Nội dung dài thêm khi đang giữ thì nâng mức giữ theo, để lần ngắn lại sau đó vẫn được giữ ở mức cao nhất.
    setHoldHeight((held) => (held > 0 && height > held ? height : held));
    onContentSizeChange?.(width, height);
  }

  return (
    <ScrollView
      ref={ref}
      scrollEnabled={scrollEnabled && !locked}
      scrollEventThrottle={scrollEventThrottle}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSize}
      contentContainerStyle={[contentContainerStyle, holdHeight > 0 ? { minHeight: holdHeight } : null]}
      {...rest}
    />
  );
});
