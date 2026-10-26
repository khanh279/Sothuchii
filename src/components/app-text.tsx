import { Text, type TextProps } from 'react-native';

import { AppFonts, type AppFontKey } from '@/constants/fonts';
import { useColors } from '@/hooks/use-colors';
import { useLanguage } from '@/i18n/language';
import { translateNode } from '@/i18n/translate';

interface Props extends TextProps {
  /** Độ đậm / kiểu chữ: regular 400, medium 500, semibold 600, bold 700, display = số/tiêu đề lớn, cùng họ chữ ở độ đậm 700. */
  weight?: AppFontKey;
  /** Màu chữ; mặc định là màu chữ chính của chủ đề. */
  color?: string;
}

/** Chữ của ứng dụng: đúng font PWA, đúng màu theo chế độ sáng/tối; nội dung chữ được dịch theo ngôn ngữ đang chọn (xem `@/i18n/translate`). Style truyền vào được ưu tiên. */
export function AppText({ weight = 'regular', color, style, children, ...rest }: Props) {
  const colors = useColors();
  const language = useLanguage();
  return (
    <Text {...rest} style={[{ fontFamily: AppFonts[weight], color: color ?? colors.ink }, style]}>
      {translateNode(children, language) as typeof children}
    </Text>
  );
}
