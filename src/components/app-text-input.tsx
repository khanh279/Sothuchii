import { TextInput } from 'react-native';
import type { ComponentProps } from 'react';

import { useLanguage } from '@/i18n/language';
import { translate } from '@/i18n/translate';

/** Ô nhập chữ của ứng dụng: như `TextInput` nhưng chữ gợi ý (`placeholder`) được dịch theo ngôn ngữ đang chọn. */
export function AppTextInput({ placeholder, ...rest }: ComponentProps<typeof TextInput>) {
  const language = useLanguage();
  return <TextInput {...rest} placeholder={placeholder ? translate(placeholder, language) : placeholder} />;
}
