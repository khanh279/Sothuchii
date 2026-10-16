import { Text, type TextProps } from 'react-native';

import { AppFonts, type AppFontKey } from '@/constants/fonts';
import { useColors } from '@/hooks/use-colors';

interface Props extends TextProps {
  /** Độ đậm / kiểu chữ: regular 400, medium 500, semibold 600, bold 700, display = số/tiêu đề lớn, cùng họ chữ ở độ đậm 700. */
  weight?: AppFontKey;
  /** Màu chữ; mặc định là màu chữ chính của chủ đề. */
  color?: string;
}

/** Chữ của ứng dụng: đúng font PWA, đúng màu theo chế độ sáng/tối. Style truyền vào được ưu tiên. */
export function AppText({ weight = 'regular', color, style, ...rest }: Props) {
  const colors = useColors();
  return <Text {...rest} style={[{ fontFamily: AppFonts[weight], color: color ?? colors.ink }, style]} />;
}
