import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { PayActionBar } from '@/components/pay-action-bar';
import { PaymentPanel } from '@/components/payment-panel';
import { PaymentSheet } from '@/components/payment-sheet';
import { SheetFrame, SheetHeader, useSheetClose } from '@/components/sheet-frame';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { recordMergedPaymentSynced } from '@/data/payService';
import type { BillPair } from '@/domain/billPairs';
import { describeDebtError } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnd } from '@/utils/format';

interface Props {
  /** Các bill làm phạm vi thanh toán (một bill ở chi tiết bill, nhiều bill ở bill gộp). */
  billIds: readonly string[];
  /** Các cặp còn phải thanh toán trong phạm vi đó (`buildBillPairsFor`). */
  pairs: readonly BillPair[];
  /** Dòng phạm vi dưới số tiền ở bảng thanh toán (ví dụ "Gộp 3 bill"); bỏ trống = không hiện. */
  scope?: string;
  /** Hiện nút Thanh toán (đã tải xong, không lỗi, còn khoản phải trả). */
  visible: boolean;
  /** Đọc lại dữ liệu sau khi ghi. */
  reload: () => Promise<void> | void;
}

/**
 * Luồng thanh toán dùng chung cho chi tiết bill và bill gộp: nút Thanh toán cố định ở đáy trang; một cặp thì mở bảng thanh toán (toàn bộ / một phần) ngay,
 * nhiều cặp thì chọn cặp trước. Ghi bằng `recordMergedPaymentSynced`; số còn phải trả tính lại ngay lúc ghi nên không ghi quá.
 */
export function BillPayFlow({ billIds, pairs, scope, visible, reload }: Props) {
  const toast = useToast();
  const [chooseOpen, setChooseOpen] = useState(false);
  const [payKey, setPayKey] = useState<string | null>(null);
  const payPair = pairs.find((pair) => pair.key === payKey) ?? null;

  return (
    <>
      <PayActionBar
        visible={visible}
        bottom={16}
        onPress={() => {
          if (pairs.length === 1) setPayKey(pairs[0].key);
          else setChooseOpen(true);
        }}
      />
      {chooseOpen && (
        <SheetFrame onClose={() => setChooseOpen(false)}>
          <SheetHeader title="Chọn khoản thanh toán" />
          <PairChoices pairs={pairs} onPick={setPayKey} />
        </SheetFrame>
      )}
      {payPair && (
        <PaymentSheet heading={`${payPair.from} trả ${payPair.to}`} amountText={formatVnd(payPair.remaining)} scope={scope} onClose={() => setPayKey(null)}>
          <PaymentPanel
            remaining={payPair.remaining}
            payer={payPair.from}
            receiver={payPair.to}
            onPay={async (amount) => {
              const result = await recordMergedPaymentSynced(payPair.from, payPair.to, billIds, amount);
              if (result.value.message) toast.show(result.value.message);
              await reload();
            }}
            onDone={() => setPayKey(null)}
            onFailure={(e) => toast.show(describeDebtError(e))}
          />
        </PaymentSheet>
      )}
    </>
  );
}

/** Danh sách cặp trong tờ nổi: chọn xong tờ trượt xuống rồi mở bảng thanh toán của cặp đó. */
function PairChoices({ pairs, onPick }: { pairs: readonly BillPair[]; onPick: (key: string) => void }) {
  const colors = useColors();
  const hide = useSheetClose();
  return (
    <View style={styles.choices}>
      {pairs.map((pair, index) => (
        <Pressable
          key={pair.key}
          accessibilityRole="button"
          accessibilityLabel={`${pair.from} trả ${pair.to} ${formatVnd(pair.remaining)}`}
          onPress={() => hide(() => onPick(pair.key))}
          style={({ pressed }) => [styles.choice, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, { opacity: pressed ? 0.7 : 1 }]}>
          <AppText weight="semibold" style={styles.name} numberOfLines={2}>
            {pair.from} → {pair.to}
          </AppText>
          <AppText weight="bold" style={styles.amount}>
            {formatVnd(pair.remaining)}
          </AppText>
          <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { paddingTop: 6 },
  choice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flex: 1, minWidth: 0, fontSize: 15.5, lineHeight: 21 },
  amount: { fontSize: 15.5, lineHeight: 21 },
});
