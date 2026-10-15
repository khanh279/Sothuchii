import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PwaColors } from '@/constants/theme';

/** Màn Thiết lập tạm thời; ngân sách và mục chi riêng được làm ở bước 2F. */
export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Thiết lập</Text>
        <Text style={styles.hint}>Ngân sách và mục chi sẽ có ở bước sau.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PwaColors.bg },
  body: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: PwaColors.ink },
  hint: { fontSize: 15, color: PwaColors.muted },
});
