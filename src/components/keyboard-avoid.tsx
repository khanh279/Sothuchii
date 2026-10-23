import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Keyboard, Platform, StyleSheet, View, type KeyboardEvent, type StyleProp, type ViewStyle } from 'react-native';

import { isModalOpen } from '@/components/modal-presence';
import { AmountSuggestBar, AmountSuggestContext, type AmountSuggestApi } from '@/components/amount-suggest';

interface Props {
  style?: StyleProp<ViewStyle>;
  /** Chỉ dùng cho khung gốc (nằm phía sau mọi Modal): bỏ qua bàn phím khi đang có Modal mở, vì lúc đó ô nhập nằm trong Modal và Modal tự lo. */
  ignoreWhenModalOpen?: boolean;
  children: ReactNode;
}

/** Đường cong gần với chuyển động bàn phím của iOS. */
const KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.77);
/** Android không báo thời lượng chuyển động của bàn phím (duration = 0): dùng một khoảng ngắn cố định. */
const FALLBACK_MS = 220;

const IOS = Platform.OS === 'ios';

type Active = Parameters<AmountSuggestApi['show']>[0];

/**
 * Khung đẩy đáy nội dung lên TRÊN bàn phím chữ / số, chạy mượt cùng nhịp bàn phím: đệm dưới được hoạt hoá theo đúng thời lượng và đường cong
 * mà hệ điều hành báo (iOS: `keyboardWillShow/Hide` nên bắt đầu cùng lúc bàn phím trượt lên; Android: khoảng ngắn cố định). Đệm = phần đáy khung bị bàn phím che,
 * đo tại thời điểm bàn phím hiện nên nếu cửa sổ đã tự co lại (Android `adjustResize`) thì phần che bằng 0 và không bị đệm đôi. Dùng cho gốc ứng dụng (mọi trang)
 * và gốc của từng tờ phủ (`Modal`, vì mỗi `Modal` là một cửa sổ riêng nên không được khung ngoài che tới).
 *
 * Khung cũng là nơi hiện thanh gợi ý số tiền (Android / web) sát ngay trên bàn phím, theo cùng đệm nên di chuyển cùng bàn phím; iOS dùng thanh phụ của bàn phím.
 * Khung gần nhất bao quanh ô nhập là khung được dùng (tờ phủ có khung riêng).
 */
export function KeyboardAvoid({ style, ignoreWhenModalOpen = false, children }: Props) {
  const rootRef = useRef<View>(null);
  const [pad] = useState(() => new Animated.Value(0));
  /** Đệm hiện tại (đích của lần hoạt hoá gần nhất): bỏ qua các sự kiện bàn phím lặp lại cho cùng một chiều cao để khung không chuyển động thừa. */
  const target = useRef(0);
  const [active, setActive] = useState<Active>(null);
  const [api] = useState<AmountSuggestApi>(() => ({ show: setActive }));

  useEffect(() => {
    const animateTo = (toValue: number, duration: number) => {
      if (Math.abs(toValue - target.current) < 1) return;
      target.current = toValue;
      Animated.timing(pad, { toValue, duration: duration > 0 ? duration : FALLBACK_MS, easing: KEYBOARD_EASING, useNativeDriver: false }).start();
    };
    const onShow = (event: KeyboardEvent) => {
      if (ignoreWhenModalOpen && isModalOpen()) return;
      // Đo đáy khung trong cửa sổ để biết bàn phím che bao nhiêu (đệm nằm BÊN TRONG khung nên không làm đổi số đo này).
      rootRef.current?.measureInWindow((_x, y, _w, height) => {
        const overlap = Math.max(0, y + height - event.endCoordinates.screenY);
        animateTo(overlap, event.duration);
      });
    };
    const onHide = (event: KeyboardEvent) => {
      setActive(null);
      animateTo(0, event.duration);
    };

    const show = Keyboard.addListener(IOS ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hide = Keyboard.addListener(IOS ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, [pad, ignoreWhenModalOpen]);

  return (
    <AmountSuggestContext.Provider value={api}>
      <Animated.View ref={rootRef} collapsable={false} style={[styles.fill, style, { paddingBottom: pad }]}>
        {children}
        {active && (
          <Animated.View style={[styles.suggest, { bottom: pad }]} pointerEvents="box-none">
            <AmountSuggestBar values={active.values} onPick={active.onPick} />
          </Animated.View>
        )}
      </Animated.View>
    </AmountSuggestContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  suggest: { position: 'absolute', left: 0, right: 0 },
});
