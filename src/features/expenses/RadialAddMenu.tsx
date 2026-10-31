import { useEffect, useRef, useState, type RefObject } from 'react';
import { Animated, BackHandler, Easing, PanResponder, Platform, Pressable, StyleSheet, View, type GestureResponderEvent, type HostInstance } from 'react-native';
import Svg, { Defs, Path, Text as SvgText, TextPath } from 'react-native-svg';

import { AppFonts } from '@/constants/fonts';
import { SvgIcon } from '@/components/svg-icon';
import type { IconName } from '@/constants/icons';
import { periodToParams, suggestedDateFor } from '@/domain/expenses';
import { FundTxnSheet } from '@/features/funds/FundTxnSheet';
import { useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import { tr } from '@/i18n/language';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { todayStr } from '@/utils/date';
import { tapHaptic } from '@/utils/haptics';
import { router } from '@/utils/safe-router';

/** Bán kính trong / ngoài của vành bán nguyệt (dp, từ tâm nút "+"): vành đồng tâm với nút, chia đều thành các ô quạt. */
const R_IN = 66;
const R_OUT = 118;
/** Khe hở nhìn thấy giữa hai ô liền kề (dp, đo ở giữa vành) và độ dày viền bo góc (dp). */
const GAP_PX = 12;
const ROUND = 8;
/** Khe hở theo góc (độ) ở giữa vành, đã cộng phần viền bo làm các ô phình ra mỗi bên. */
const GAP_DEG = (((GAP_PX + ROUND) / ((R_IN + R_OUT) / 2)) * 180) / Math.PI;
/** Ô tròn "Thêm nhanh" ở chính giữa (đè lên nút "+"): bán kính hiển thị; khi vuốt chỉ tính trúng trong bán kính nhỏ `R_CENTER_HIT`; vuốt ra quá `R_AIM` thì bắt đầu "nhắm" tới ô quạt theo hướng. */
const R_CENTER = 38;
const R_CENTER_HIT = 22;
const R_AIM = 30;
/** Chỉ số của ô giữa trong `hover` (các ô quạt là 0, 1, 2…). */
const CENTER = -1;
/** Giữ nút "+" lâu hơn chừng này (ms) mà không vuốt thì ô "Thêm nhanh" sáng lên, nhả tay là chọn nó; chạm nhanh thì menu chỉ mở ra để bấm chọn. */
const HOLD_MS = 350;
/** Sau khi chọn (bấm hoặc nhả tay) giữ hiệu ứng ô được chọn thêm chừng này (ms) rồi đóng menu (màn hình đích đã được mở ngay lúc chọn). */
const SELECT_DELAY_MS = 70;
/** Chữ cong theo cung đồng tâm gần mép trong (dưới) của ô: bán kính đường nền chữ; biểu tượng nằm phía ngoài chữ ở bán kính `ICON_RADIUS`. */
const TEXT_RADIUS = 76;
const ICON_RADIUS = 104;
const USE_NATIVE = Platform.OS !== 'web';

type RadialKey = 'expense' | 'bill' | 'fund' | 'quick';
interface RadialItem {
  key: RadialKey;
  label: string;
  icon: IconName;
  disabled?: boolean;
}
interface Point {
  x: number;
  y: number;
}

/** Điểm trên đường tròn bán kính `r` quanh `center` ở góc `deg` (độ, 0° = bên phải, 90° = thẳng lên, 180° = bên trái). */
function polar(center: Point, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: center.x + r * Math.cos(rad), y: center.y - r * Math.sin(rad) };
}

/** Ô quạt thứ `index` (trái → phải) của vành bán nguyệt gồm `count` ô: góc bắt đầu (lớn hơn) và kết thúc (nhỏ hơn), đã trừ khe hở. */
function sectorAngles(index: number, count: number): { from: number; to: number; mid: number } {
  const span = 180 / count;
  const from = 180 - index * span - GAP_DEG / 2;
  const to = 180 - (index + 1) * span + GAP_DEG / 2;
  return { from, to, mid: (from + to) / 2 };
}

/** Ô quạt theo HƯỚNG của điểm so với tâm (không xét khoảng cách), null nếu điểm nằm phía dưới nút "+". */
function sectorByAngle(dx: number, dy: number, count: number): number | null {
  if (dy < 0) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return Math.min(count - 1, Math.max(0, Math.floor((180 - angle) / (180 / count))));
}

/**
 * Vùng mà điểm `point` rơi vào: `zone` = ô thật sự trúng (ô quạt trên vành, hoặc `CENTER` khi ở sát tâm), `aim` = ô quạt đang được NHẮM tới theo hướng vuốt khi ngón tay đã rời tâm nhưng chưa tới vành
 * (để báo trước "vuốt hướng này chọn được ô này"). `tap` = true khi tính cho thao tác chạm (ô giữa trúng cả hình tròn hiển thị), false khi tính lúc vuốt.
 */
function zoneAt(point: Point, center: Point, count: number, tap: boolean): { zone: number | null; aim: number | null } {
  const dx = point.x - center.x;
  const dy = center.y - point.y;
  const r = Math.hypot(dx, dy);
  if (r <= (tap ? R_CENTER : R_CENTER_HIT)) return { zone: CENTER, aim: null };
  if (r < R_IN - 4) return { zone: null, aim: r > R_AIM ? sectorByAngle(dx, dy, count) : null };
  if (r > R_OUT + 4) return { zone: null, aim: null };
  return { zone: sectorByAngle(dx, dy, count), aim: null };
}

export interface RadialAdd {
  open: boolean;
  /** Tâm nút "+" theo toạ độ cửa sổ khi menu đang mở. */
  center: Point | null;
  /** Ô đang được ngón tay vuốt tới và nhả tay là chọn (ô quạt 0, 1, 2… hoặc `CENTER`; null = chưa tới ô nào). */
  hover: number | null;
  /** Ô quạt đang được "nhắm" theo hướng vuốt (ngón tay đã rời tâm, chưa tới vành): báo trước hướng đó chọn được. */
  aim: number | null;
  items: readonly RadialItem[];
  /** Ô tròn "Thêm nhanh" ở chính giữa. */
  quick: RadialItem;
  fundSheet: boolean;
  setFundSheet: (open: boolean) => void;
  setHover: (index: number | null) => void;
  setAim: (index: number | null) => void;
  show: (center: Point) => void;
  close: () => void;
  select: (index: number) => void;
}

/**
 * Trạng thái và hành động của menu mở từ nút "+": vành bán nguyệt đồng tâm với nút, chia ba ô — Tạo bill (trái), Chi tiêu (giữa), Chi quỹ (phải) — và ô tròn "Thêm nhanh" ở chính tâm (mở trang Thêm nhanh: chụp ảnh, gợi ý nội dung / số tiền); mỗi ô mở thẳng luồng nghiệp vụ hiện có (không có luồng mới).
 * "Chi tiêu quỹ": đúng một quỹ thì vào thẳng form của quỹ đó, nhiều quỹ thì mở tờ chọn quỹ trước; chưa có quỹ nào thì ô đó mờ, không bấm được.
 */
export function useRadialAdd(): RadialAdd {
  const { period } = useSharedPeriod();
  const funds = useFundData().data.funds;
  const [open, setOpen] = useState(false);
  const [center, setCenter] = useState<Point | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [aim, setAim] = useState<number | null>(null);
  const [fundSheet, setFundSheet] = useState(false);

  const items: RadialItem[] = [
    { key: 'bill', label: 'Tạo bill', icon: 'receipt' },
    { key: 'expense', label: 'Chi tiêu', icon: 'person' },
    {
      key: 'fund',
      label: 'Chi quỹ',
      icon: 'people',
      disabled: funds.length === 0,
    },
  ];

  const quick: RadialItem = {
    key: 'quick',
    label: 'Thêm nhanh',
    icon: 'camera',
  };

  const close = () => {
    setOpen(false);
    setHover(null);
    setAim(null);
  };
  const run = (key: RadialKey) => {
    if (key === 'expense')
      router.push({
        pathname: '/chi-tieu/nhap',
        params: {
          ...periodToParams(period),
          d: suggestedDateFor(period, todayStr()),
        },
      });
    else if (key === 'bill') router.push('/chia-bill/tao');
    else if (key === 'quick') router.push('/chup-nhanh');
    else if (funds.length === 1) router.push({ pathname: '/quy/chi-tieu', params: { fund: funds[0].id } });
    else setFundSheet(true);
  };

  return {
    open,
    center,
    hover,
    aim,
    items,
    quick,
    fundSheet,
    setFundSheet,
    setHover,
    setAim,
    show: (next) => {
      setCenter(next);
      setHover(null);
      setAim(null);
      setOpen(true);
    },
    close,
    select: (index) => {
      const item = index === CENTER ? quick : items[index];
      if (!item || item.disabled) return;
      // Chuyển màn hình NGAY; ô được chọn đổi màu nền một nhịp ngắn rồi menu mới tự đóng (đóng sau thì màn hình mới đã bắt đầu hiện, không thấy trễ).
      setHover(index);
      setAim(null);
      run(item.key);
      setTimeout(close, SELECT_DELAY_MS);
    },
  };
}

/* Các hàm xử lý chạm của PanResponder chỉ đọc / ghi ref khi có thao tác, không phải lúc dựng giao diện. */
/* eslint-disable react-hooks/refs */
/**
 * Cử chỉ của nút "+": chạm một cái thì vành bán nguyệt hiện ra và ở lại để bấm chọn một ô; hoặc GIỮ rồi VUỐT từ nút "+" ra một ô và nhả tay để chọn ngay (nhả ở chỗ trống thì đóng).
 * Trả về các hàm xử lý chạm gắn vào nút, `onLayout` (đo sẵn tâm nút) và `openAtPlus` cho trình đọc màn hình.
 */
export function usePlusGesture(radial: RadialAdd, plusRef: RefObject<HostInstance | null>) {
  /** Tâm nút "+" theo toạ độ cửa sổ, đo sẵn khi bố cục xong (và đo lại mỗi lần chạm) nên vuốt ngay không phải chờ đo. */
  const centerRef = useRef<Point | null>(null);
  const measure = (then?: (center: Point) => void) => {
    plusRef.current?.measureInWindow((x, y, width, height) => {
      centerRef.current = { x: x + width / 2, y: y + height / 2 };
      then?.(centerRef.current);
    });
  };
  const openAtPlus = () => measure((center) => radial.show(center));
  // Bản mới nhất của trạng thái và hàm mở menu cho các hàm xử lý chạm (tạo một lần).
  const live = useRef({ ...radial, openAtPlus, measure });
  useEffect(() => {
    live.current = { ...radial, openAtPlus, measure };
  });
  const start = useRef<Point>({ x: 0, y: 0 });
  const moved = useRef(false);
  const hoverRef = useRef<number | null>(null);
  const aimRef = useRef<number | null>(null);
  /** Ngón tay đã rời khỏi tâm ít nhất một lần: chỉ khi đó quay lại tâm mới tính là chọn "Thêm nhanh" (chạm giữ ban đầu ở nút "+" không chọn nhầm). */
  const leftCenter = useRef(false);
  /** Đã giữ nút "+" đủ lâu: ô "Thêm nhanh" đang sáng và giữ nguyên là đã chọn cho tới khi ngón tay rời khỏi tâm. */
  const holdActive = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        start.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
        moved.current = false;
        hoverRef.current = null;
        aimRef.current = null;
        leftCenter.current = false;
        holdActive.current = false;
        // Giữ nguyên tại nút "+" đủ lâu: ô "Thêm nhanh" sáng lên báo rằng nhả tay là chọn nó.
        clearHold();
        holdTimer.current = setTimeout(() => {
          if (moved.current) return;
          holdActive.current = true;
          hoverRef.current = CENTER;
          live.current.setHover(CENTER);
          tapHaptic();
        }, HOLD_MS);
        if (centerRef.current) live.current.show(centerRef.current);
        live.current.measure((center) => live.current.show(center));
      },
      onPanResponderMove: (event) => {
        const { pageX, pageY } = event.nativeEvent;
        if (Math.hypot(pageX - start.current.x, pageY - start.current.y) > 8) {
          moved.current = true;
          clearHold();
        }
        const center = centerRef.current;
        const { items } = live.current;
        if (!center) return;
        const { zone, aim } = zoneAt({ x: pageX, y: pageY }, center, items.length, false);
        if (zone !== CENTER) {
          leftCenter.current = true;
          holdActive.current = false;
        }
        // Ô giữa chỉ tính chọn khi ngón tay đã rời tâm rồi quay lại, hoặc đã giữ đủ lâu tại tâm (không để rung tay nhỏ làm nó tắt).
        const selectable = zone === CENTER ? leftCenter.current || holdActive.current : zone !== null && !items[zone].disabled;
        const nextHover = selectable ? zone : null;
        const nextAim = aim !== null && !items[aim].disabled ? aim : null;
        if (nextHover !== hoverRef.current) {
          hoverRef.current = nextHover;
          live.current.setHover(nextHover);
          // Vừa tới một ô chọn được: rung nhẹ để biết.
          if (nextHover !== null) tapHaptic();
        }
        if (nextAim !== aimRef.current) {
          aimRef.current = nextAim;
          live.current.setAim(nextAim);
        }
      },
      onPanResponderRelease: () => {
        clearHold();
        const picked = hoverRef.current;
        hoverRef.current = null;
        aimRef.current = null;
        if (picked !== null) live.current.select(picked);
        else if (moved.current) live.current.close();
        // Chạm nhanh không vuốt: để menu mở cho người dùng bấm chọn.
      },
      onPanResponderTerminate: () => {
        clearHold();
        live.current.close();
      },
    }),
  ).current;
  return {
    panHandlers: responder.panHandlers,
    openAtPlus,
    onLayout: () => measure(),
  };
}
/* eslint-enable react-hooks/refs */

/** Lớp phủ toàn màn hình của menu: nền mờ (chạm ra ngoài để đóng), vành bán nguyệt ba ô; kèm tờ chọn quỹ cho "Chi tiêu quỹ". */
export function RadialAddOverlay({ radial }: { radial: RadialAdd }) {
  return (
    <>
      {radial.open && radial.center && <Fan radial={radial} center={radial.center} />}
      {radial.fundSheet && <FundTxnSheet mode="chi" onClose={() => radial.setFundSheet(false)} />}
    </>
  );
}

/** Đường viền một ô quạt: cung ngoài từ `from` đến `to`, nối vào cung trong quay ngược lại. */
function sectorPath(from: number, to: number): string {
  const origin = { x: R_OUT, y: R_OUT };
  // Viền bo (stroke) làm ô phình ra `ROUND / 2` mỗi bên: co bán kính vào chừng đó để vành nhìn thấy đúng từ R_IN đến R_OUT.
  const outer = R_OUT - ROUND / 2;
  const inner = R_IN + ROUND / 2;
  const a = polar(origin, outer, from);
  const b = polar(origin, outer, to);
  const c = polar(origin, inner, to);
  const d = polar(origin, inner, from);
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`;
}

function Fan({ radial, center }: { radial: RadialAdd; center: Point }) {
  const colors = useColors();
  const rootRef = useRef<HostInstance>(null);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  const { close, items, hover, aim, select, quick } = radial;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE,
    }).start();
  }, [progress]);
  // Nút Back (Android) đóng menu.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);

  /** Chạm lên nền: trúng ô nào thì chọn ô đó, ngoài các ô thì đóng. */
  function onBackdropPress(event: GestureResponderEvent) {
    const { pageX, pageY } = event.nativeEvent;
    const { zone } = zoneAt({ x: pageX, y: pageY }, center, items.length, true);
    if (zone !== null) select(zone);
    else close();
  }

  const local = origin ? { x: center.x - origin.x, y: center.y - origin.y } : null;
  const box = R_OUT * 2;
  return (
    <View ref={rootRef} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} onLayout={() => rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress, backgroundColor: 'rgba(10, 22, 40, 0.5)' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onBackdropPress} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {local && (
        // Khung vuông 2×R_OUT có tâm trùng tâm nút "+": vành bán nguyệt, biểu tượng và chữ CÙNG phóng to từ tâm đó (và mờ dần hiện ra) nên bung ra đồng tâm với nút, chữ luôn dính với ô.
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: local.x - R_OUT,
            top: local.y - R_OUT,
            width: box,
            height: box,
            opacity: progress,
            transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
          }}
        >
          <Svg width={box} height={box}>
            <Defs>
              {items.map((item, index) => {
                // Cung đường nền chữ chạy từ trái sang phải (theo chiều kim đồng hồ) nên chữ quay đầu lên phía ngoài, cong theo mép trong của ô.
                const { mid } = sectorAngles(index, items.length);
                const a = polar({ x: R_OUT, y: R_OUT }, TEXT_RADIUS, mid + 40);
                const b = polar({ x: R_OUT, y: R_OUT }, TEXT_RADIUS, mid - 40);
                return <Path key={item.key} id={`radial-text-${item.key}`} d={`M ${a.x} ${a.y} A ${TEXT_RADIUS} ${TEXT_RADIUS} 0 0 1 ${b.x} ${b.y}`} />;
              })}
            </Defs>
            {items.map((item, index) => {
              const { from, to } = sectorAngles(index, items.length);
              // Cả bốn ô cùng màu nền trắng; trúng ô (nhả tay hoặc bấm là chọn) = màu chủ đạo; đang nhắm tới ô theo hướng vuốt = màu chủ đạo nhạt.
              const fill = hover === index ? colors.primary : aim === index ? colors.primarySoft : colors.surface;
              return <Path key={item.key} d={sectorPath(from, to)} fill={fill} stroke={fill} strokeWidth={ROUND} strokeLinejoin="round" opacity={item.disabled ? 0.55 : 1} />;
            })}
            {items.map((item) => (
              <SvgText
                key={`label-${item.key}`}
                fill={hover === items.indexOf(item) ? colors.primaryInk : colors.ink}
                fontFamily={AppFonts.semibold}
                fontSize={11}
                opacity={item.disabled ? 0.55 : 1}
                textAnchor="middle"
              >
                <TextPath href={`#radial-text-${item.key}`} startOffset="50%">
                  {tr(item.label)}
                </TextPath>
              </SvgText>
            ))}
          </Svg>
          {items.map((item, index) => {
            const { mid } = sectorAngles(index, items.length);
            const at = polar({ x: R_OUT, y: R_OUT }, ICON_RADIUS, mid);
            const active = hover === index;
            const aiming = aim === index;
            return (
              <View
                key={item.key}
                accessible
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={() => select(index)}
                style={[styles.cell, { left: at.x - ICON_BOX / 2, top: at.y - ICON_BOX / 2, opacity: item.disabled ? 0.55 : 1, transform: [{ rotate: `${90 - mid}deg` }] }]}
              >
                <SvgIcon name={item.icon} size={22} color={active ? colors.primaryInk : colors.primary} strokeWidth={aiming ? 2.6 : 2} />
              </View>
            );
          })}
          {/* Ô tròn "Thêm nhanh" ở chính tâm (đè lên nút "+"), chỉ có biểu tượng máy ảnh: cùng màu với ba ô quạt; đảo sang màu chủ đạo khi trúng (giữ nút "+" rồi nhả, vuốt về lại tâm, hoặc bấm chọn). */}
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={quick.label}
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={() => select(CENTER)}
            style={[
              styles.center,
              {
                left: R_OUT - R_CENTER,
                top: R_OUT - R_CENTER,
                backgroundColor: hover === CENTER ? colors.primary : colors.surface,
              },
            ]}
          >
            <SvgIcon name={quick.icon} size={28} color={hover === CENTER ? colors.primaryInk : colors.primary} strokeWidth={2} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const ICON_BOX = 30;
const styles = StyleSheet.create({
  cell: { position: 'absolute', width: ICON_BOX, height: ICON_BOX, alignItems: 'center', justifyContent: 'center' },
  center: {
    position: 'absolute',
    width: R_CENTER * 2,
    height: R_CENTER * 2,
    borderRadius: R_CENTER,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
