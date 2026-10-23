import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SheetFrame, SheetHeader } from '@/components/sheet-frame';
import { fundBalance } from '@/domain/funds';
import { FundRow } from '@/features/funds/FundExpensePanel';
import { useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnd } from '@/utils/format';

interface Props {
  /** 'thu': ghi lần đóng (thu) quỹ; 'chi': ghi khoản chi quỹ. */
  mode: 'thu' | 'chi';
  onClose: () => void;
}

/**
 * Thẻ mở nổi (tờ trượt từ đáy) liệt kê các quỹ để chọn, dùng chung cho nút "+" ở Tổng quan (Chi tiêu quỹ) và mục Giao dịch quỹ ở tab Quỹ nhóm (Thu quỹ / Chi tiêu quỹ).
 * Mỗi dòng: tên quỹ và số dư. Chọn một quỹ thì đóng thẻ và mở TRANG RIÊNG của form Thu quỹ / Chi tiêu quỹ cho quỹ đó (`/quy/thu-quy`, `/quy/chi-tieu`, tham số `fund`),
 * như trước đây. Thẻ chỉ để chọn: đóng thẻ không tạo giao dịch nào.
 */
export function FundTxnSheet({ mode, onClose }: Props) {
  const colors = useColors();
  const { data, loaded, error } = useFundData();
  const title = mode === 'thu' ? 'Thu quỹ' : 'Chi tiêu quỹ';

  let body;
  if (error) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          {error}
        </AppText>
      </View>
    );
  } else if (!loaded) {
    body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  } else if (data.funds.length === 0) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.bg }]}>
        <AppText color={colors.muted} style={styles.noticeText}>
          {mode === 'thu' ? 'Chưa có quỹ nào. Hãy tạo quỹ mới trước khi ghi khoản thu.' : 'Chưa có quỹ nào. Hãy tạo quỹ ở tab Quỹ nhóm trước khi ghi chi tiêu quỹ.'}
        </AppText>
      </View>
    );
  } else {
    body = (
      <>
        <AppText color={colors.muted} style={styles.hint}>
          {mode === 'thu' ? 'Chọn quỹ để ghi khoản thu' : 'Chọn quỹ để ghi khoản chi'}
        </AppText>
        {data.funds.map((item) => {
          const balance = fundBalance(data, item.id);
          return (
            <FundRow
              key={item.id}
              name={item.name}
              balance={formatVnd(balance)}
              balanceColor={balance < 0 ? colors.danger : colors.success}
              label={`${item.name}, số dư ${formatVnd(balance)}`}
              onPress={() => {
                onClose();
                router.push({ pathname: mode === 'thu' ? '/quy/thu-quy' : '/quy/chi-tieu', params: { fund: item.id } });
              }}
            />
          );
        })}
      </>
    );
  }

  return (
    <SheetFrame onClose={onClose} maxHeight="80%">
      <View style={styles.content}>
        <SheetHeader title={title} />
        {body}
      </View>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  hint: { fontSize: 13, lineHeight: 18 },
  loading: { marginVertical: 32 },
  notice: { borderRadius: 12, padding: 14 },
  noticeText: { fontSize: 14, lineHeight: 20 },
});
