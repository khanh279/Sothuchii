import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PwaColors } from '@/constants/theme';

/** Màn Tổng quan tạm thời; nội dung thật (thẻ Đã chi, biểu đồ) được làm ở bước 2E. */
export default function OverviewScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Sổ Thu Chi</Text>
        <Text style={styles.hint}>Tổng quan đang được xây dựng.</Text>
        <Pressable style={styles.button} onPress={() => router.push('/chi-tieu/nhap')}>
          <Text style={styles.buttonText}>+ Thêm khoản chi</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push({ pathname: '/lich-su', params: { mode: 'all' } })}>
          <Text style={styles.buttonText}>Xem lịch sử (tất cả)</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PwaColors.bg },
  body: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: PwaColors.ink },
  hint: { fontSize: 15, color: PwaColors.muted },
  button: { marginTop: 8, minHeight: 48, borderRadius: 12, backgroundColor: PwaColors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: PwaColors.primaryInk, fontSize: 16, fontWeight: '600' },
});
