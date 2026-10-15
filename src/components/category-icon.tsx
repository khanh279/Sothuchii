import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { ICON_PATHS } from '@/constants/categories';
import { categoryIconName } from '@/domain/expenses';
import type { Category } from '@/types/expense';
import { withAlpha } from '@/utils/color';
import { parseSvgMarkup, type SvgShape } from '@/utils/svg-markup';

const shapeCache = new Map<string, SvgShape[]>();

function shapesFor(iconName: string): SvgShape[] {
  let shapes = shapeCache.get(iconName);
  if (!shapes) {
    shapes = parseSvgMarkup(ICON_PATHS[iconName] ?? '');
    shapeCache.set(iconName, shapes);
  }
  return shapes;
}

/**
 * Biểu tượng một mục chi, đúng `.ico` của PWA: ô vuông bo 12 (ở cỡ 40), nền màu mục 16%,
 * nét màu mục dày 1.8, hình 22 (ở cỡ 40).
 */
export function CategoryIcon({ category, size = 40, glyph }: { category: Category; size?: number; glyph?: number }) {
  const shapes = shapesFor(categoryIconName(category));
  const inner = glyph ?? Math.round(size * 0.55);
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: withAlpha(category.color, 0.16) }]}>
      <Svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke={category.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {shapes.map((shape, index) => {
          if (shape.kind === 'path') return <Path key={index} d={shape.d} />;
          if (shape.kind === 'circle') return <Circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} />;
          return <Rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
