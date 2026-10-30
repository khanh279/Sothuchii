import createQr from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

/** Viền trắng quanh mã (đơn vị: ô); chuẩn QR cần tối thiểu 4 ô để máy quét nhận ổn định. */
const QUIET_ZONE = 4;

/**
 * Mã QR vẽ ngay trên máy (không gọi dịch vụ nào): `value` là chuỗi cần mã hoá, `size` là cạnh của hình vuông (dp). Nền trắng, ô đen, mức sửa lỗi M. Chuỗi quá dài không mã hoá được thì không vẽ gì.
 */
export function QrCode({ value, size }: { value: string; size: number }) {
  const matrix = useMemo(() => {
    try {
      const code = createQr(0, 'M');
      code.addData(value);
      code.make();
      const count = code.getModuleCount();
      return { count, dark: (row: number, col: number) => code.isDark(row, col) };
    } catch {
      return null;
    }
  }, [value]);
  if (!matrix) return null;
  const total = matrix.count + QUIET_ZONE * 2;
  // Mọi ô đen gom vào MỘT đường vẽ (mỗi ô là một hình vuông 1×1) cho nhẹ.
  let path = '';
  for (let row = 0; row < matrix.count; row++) {
    for (let col = 0; col < matrix.count; col++) {
      if (matrix.dark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} accessibilityLabel="Mã QR">
      <Rect x={0} y={0} width={total} height={total} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
