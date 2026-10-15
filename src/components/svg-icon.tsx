import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Icons, type IconName } from '@/constants/icons';
import { parseSvgMarkup, type SvgShape } from '@/utils/svg-markup';

const cache = new Map<IconName, SvgShape[]>();

function shapesOf(name: IconName): SvgShape[] {
  let shapes = cache.get(name);
  if (!shapes) {
    shapes = parseSvgMarkup(Icons[name]);
    cache.set(name, shapes);
  }
  return shapes;
}

interface Props {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/** Biểu tượng nét đơn của PWA (bo tròn đầu nét, không tô). */
export function SvgIcon({ name, size = 24, color, strokeWidth = 1.8 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {shapesOf(name).map((shape, index) => {
        if (shape.kind === 'path') return <Path key={index} d={shape.d} />;
        if (shape.kind === 'circle') return <Circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} />;
        return <Rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
      })}
    </Svg>
  );
}
