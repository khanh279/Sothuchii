import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PayFormScreen from '@/features/debts/PayFormScreen';
import { useColors } from '@/hooks/use-colors';

/** Quay lại màn trước; nếu không có màn trước (mở thẳng trang này) thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Sửa / xoá một khoản trả (tham số route `ids`, nhiều mã cách nhau bằng dấu phẩy = một nhóm trả bill). */
export default function EditPayRoute() {
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const list = (ids ?? '').split(',').filter(Boolean);
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Sửa giao dịch', headerShown: false }} />
      <PayFormScreen editIds={list} onFinished={leave} />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
