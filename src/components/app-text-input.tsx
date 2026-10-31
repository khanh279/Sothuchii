import { Platform, TextInput } from 'react-native';
import type { ComponentProps } from 'react';

import { useLanguage } from '@/i18n/language';
import { translate } from '@/i18n/translate';
import { emitInputFocus } from '@/utils/input-focus';

/** Bản web: bỏ khung viền mặc định của trình duyệt khi ô đang được chọn (ô đã tự có viền / nền riêng). Điện thoại không có khung này. */
const NO_FOCUS_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;

/** Ô nhập chữ của ứng dụng: như `TextInput` nhưng chữ gợi ý (`placeholder`) được dịch theo ngôn ngữ đang chọn và không hiện khung viền mặc định khi chọn ô trên web. */
export function AppTextInput({ placeholder, style, onFocus, ...rest }: ComponentProps<typeof TextInput>) {
  const language = useLanguage();
  return (
    <TextInput
      {...rest}
      onFocus={(event) => {
        emitInputFocus();
        onFocus?.(event);
      }}
      style={[NO_FOCUS_OUTLINE, style]}
      placeholder={placeholder ? translate(placeholder, language) : placeholder}
    />
  );
}
