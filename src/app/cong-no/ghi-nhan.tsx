import { Stack, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PayFormScreen from '@/features/debts/PayFormScreen';
import { useColors } from '@/hooks/use-colors';

/** Quay lại màn trước; mở thẳng trang này thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Ghi nhận chuyển tiền (mở từ nút + ở Tổng quan hoặc tab Công nợ): dùng lại biểu mẫu và service chuyển tiền sẵn có. */
export default function RecordTransferRoute() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Ghi nhận chuyển tiền', headerShown: false }} />
      <PayFormScreen onFinished={leave} />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
