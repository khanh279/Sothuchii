import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SWIPE_ACTIONS_WIDTH, swipeIntent, swipeOffset, swipeSettle } from '@/domain/swipe';
import { useColors } from '@/hooks/use-colors';

/** Màu hai nút đo từ PWA: Xoá #D64545, đã bấm một lần (`arm`) #B42318. */
const DELETE_COLOR = '#D64545';
const DELETE_ARMED_COLOR = '#B42318';

interface Props {
  /** Dòng đang mở (do màn hình cha quản lý để chỉ một dòng mở tại một thời điểm). */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Chạm vào dòng khi đang đóng (PWA: không làm gì; cha dùng để đóng dòng khác). */
  onPressRow?: () => void;
  /** Nền của dòng (phải đặc để che hai nút phía sau). */
  background: string;
  radius?: number;
  accessibilityLabel?: string;
  children: ReactNode;
}

/**
 * Dòng vuốt sang trái để hiện hai nút Sửa / Xoá (`.st-swr` của PWA). Nút Xoá bấm lần đầu đổi thành
 * "Xoá?" (đỏ đậm), bấm lần hai mới xoá. Chạm vào dòng đang mở thì đóng lại; chạm dòng đóng không làm gì.
 */
export function SwipeRow({ open, onOpen, onClose, onEdit, onDelete, onPressRow, background, radius = 14, accessibilityLabel, children }: Props) {
  const colors = useColors();
  const x = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);
  const startOffset = useRef(0);
  const live = useRef({ open, onOpen, onClose });
  const [armed, setArmed] = useState(false);
  const useNative = Platform.OS !== 'web';

  useEffect(() => {
    live.current = { open, onOpen, onClose };
  });

  useEffect(() => {
    const id = x.addListener(({ value }) => {
      offset.current = value;
    });
    return () => x.removeListener(id);
  }, [x]);

  // Dòng khác được mở (hoặc cha đóng dòng này): trượt về đúng vị trí.
  useEffect(() => {
    animateTo(open ? -SWIPE_ACTIONS_WIDTH : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function animateTo(value: number) {
    Animated.timing(x, {
      toValue: value,
      duration: 220,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: useNative,
    }).start();
  }

  const pan = useRef(
    PanResponder.create({
      // Giai đoạn capture: giành quyền trước nút bấm bên trong khi cử chỉ rõ ràng là vuốt ngang.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) => swipeIntent(g.dx, g.dy, live.current.open) === 'horizontal',
      onPanResponderGrant: () => {
        x.stopAnimation();
        startOffset.current = live.current.open ? -SWIPE_ACTIONS_WIDTH : 0;
      },
      onPanResponderMove: (_, g) => x.setValue(swipeOffset(startOffset.current, g.dx)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => finish(swipeOffset(startOffset.current, g.dx)),
      onPanResponderTerminate: (_, g) => finish(swipeOffset(startOffset.current, g.dx)),
    }),
  ).current;

  function finish(finalOffset: number) {
    if (swipeSettle(finalOffset) === 'open') {
      setArmed(false);
      animateTo(-SWIPE_ACTIONS_WIDTH);
      live.current.onOpen();
    } else {
      animateTo(0);
      live.current.onClose();
    }
  }

  const armedNow = armed && open;
  // Hai nút chỉ hiện khi dòng đã trượt (tránh lộ mép xanh phía sau dòng đang đóng).
  const actionsOpacity = x.interpolate({ inputRange: [-6, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={[styles.wrap, { borderRadius: radius }]}>
      <Animated.View style={[styles.actions, { opacity: actionsOpacity }]} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable
          style={[styles.action, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Sửa"
          onPress={() => {
            onClose();
            onEdit();
          }}>
          <AppText weight="bold" color="#FFFFFF" style={styles.actionText}>
            Sửa
          </AppText>
        </Pressable>
        <Pressable
          style={[styles.action, { backgroundColor: armedNow ? DELETE_ARMED_COLOR : DELETE_COLOR }]}
          accessibilityRole="button"
          accessibilityLabel={armedNow ? 'Xoá, chạm lần nữa để xác nhận' : 'Xoá'}
          onPress={() => {
            if (!armedNow) setArmed(true);
            else onDelete();
          }}>
          <AppText weight="bold" color="#FFFFFF" style={styles.actionText}>
            {armedNow ? 'Xoá?' : 'Xoá'}
          </AppText>
        </Pressable>
      </Animated.View>

      <Animated.View {...pan.panHandlers} style={[{ transform: [{ translateX: x }], backgroundColor: background }, styles.noSelect]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[
            { name: 'edit', label: 'Sửa' },
            { name: 'delete', label: 'Xoá' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'edit') onEdit();
            else if (event.nativeEvent.actionName === 'delete') onDelete();
          }}
          onPress={() => (open ? onClose() : onPressRow?.())}>
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  actions: { position: 'absolute', top: 0, right: 0, bottom: 0, width: SWIPE_ACTIONS_WIDTH, flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14.5 },
  noSelect: { userSelect: 'none' },
});
