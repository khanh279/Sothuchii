import Svg, { Circle, ClipPath, Defs, G, Path, Polygon, Rect } from 'react-native-svg';

import type { Language } from '@/i18n/translate';

/**
 * Cờ tròn của một ngôn ngữ (vẽ bằng SVG nên hiện giống nhau ở mọi nền tảng, không phụ thuộc emoji cờ của hệ điều hành):
 * Tiếng Việt = cờ Việt Nam (nền đỏ, sao vàng); English = cờ Vương quốc Anh (Union Jack rút gọn).
 */
export function FlagIcon({ language, size = 28 }: { language: Language; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60">
      <Defs>
        <ClipPath id={`flag-${language}`}>
          <Circle cx="30" cy="30" r="30" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#flag-${language})`}>
        {language === 'vi' ? (
          <>
            <Rect width="60" height="60" fill="#DA251D" />
            <Polygon fill="#FFFF00" points="30,12 34.4,24.8 47.9,25 37.1,33.2 41.1,46 30,38.2 18.9,46 22.9,33.2 12.1,25 25.6,24.8" />
          </>
        ) : (
          <>
            <Rect width="60" height="60" fill="#012169" />
            <Path d="M0 0L60 60M60 0L0 60" stroke="#FFFFFF" strokeWidth="11" />
            <Path d="M0 0L60 60M60 0L0 60" stroke="#C8102E" strokeWidth="5" />
            <Path d="M30 0V60M0 30H60" stroke="#FFFFFF" strokeWidth="18" />
            <Path d="M30 0V60M0 30H60" stroke="#C8102E" strokeWidth="10" />
          </>
        )}
      </G>
    </Svg>
  );
}
