
import { useState } from 'react';
import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

export default function ExpenseScreen() {
  const [amount, setAmount] = useState('');

  function handleAddExpense() {
    const value = Number(amount);

    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      Alert.alert('Thông báo', 'Nhập số tiền hợp lệ nhé.');
      return;
    }

    Alert.alert(
      'Thành công',
      `Đã thử nhập khoản chi ${value.toLocaleString('vi-VN')} đ`,
    );

    setAmount('');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sổ Thu Chi</Text>
      <Text style={styles.label}>Nhập số tiền</Text>

      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="Ví dụ: 50000"
      />

      <Pressable style={styles.button} onPress={handleAddExpense}>
        <Text style={styles.buttonText}>Kiểm tra</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#F5F7FB',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 28,
    color: '#17324D',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DEE8',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1769AA',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
