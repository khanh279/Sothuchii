import { Stack, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BillCalcScreen from '@/features/bills/BillCalcScreen';
import { useColors } from '@/hooks/use-colors';

/** Quay lại màn trước (danh sách bill, giữ nguyên kỳ đang xem); mở thẳng trang này thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Tạo bill mới (mở từ nút "Tạo bill" ở tab Chia bill): dùng lại màn tính chia; lưu xong quay lại. */
export default function CreateBillRoute() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Tạo bill', headerShown: false }} />
      <BillCalcScreen onFinished={leave} />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
