import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { PaymentPanel, type PayChoice } from '@/components/payment-panel';
import { PaymentSheet } from '@/components/payment-sheet';
import { SheetFrame, SheetHeader, useSheetClose } from '@/components/sheet-frame';
import { useToast } from '@/components/toast';
import { FundInputError } from '@/data/fundRepository';
import { saveFundTxnSynced } from '@/data/fundService';
import { PayInputError } from '@/data/payRepository';
import { newExpenseId } from '@/domain/expenses';
import { combinedPayoutLimit, fundPersonTargets, maxPayoutNow, planCombinedPayout, type FundPayTarget } from '@/domain/fundAdvance';
import { describeFundError } from '@/features/funds/hooks';
import type { PersonDebtSide } from '@/domain/fundPerson';
import { useColors } from '@/hooks/use-colors';
import type { FundData } from '@/types/fund';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

export const FUND_PAY_KIND_LABEL = { payout: 'Quỹ trả', refund: 'Hoàn tiền ứng' } as const;

/** Khoản quỹ trả đã hết nợ: không còn gì để thanh toán. Trả nợ không bị giới hạn bởi số còn lại của quỹ. */
export const isFundPayBlocked = (item: FundPayTarget) => item.kind === 'payout' && maxPayoutNow(item) <= 0;

/**
 * Ghi một lần thanh toán quỹ / hoàn tiền ứng bằng `saveFundTxnSynced` (kiểm tra lại số dư lúc ghi). Mã giao dịch sinh một lần cho mỗi khoản được chọn
 * nên xác nhận nhiều lần không ghi trùng; ghi xong thì thông báo và tải lại dữ liệu quỹ.
 */
export function useFundPay(reload: () => Promise<void> | void) {
  const toast = useToast();
  const [clientIds] = useState(() => new Map<string, string>());

  function clientIdFor(item: FundPayTarget): string {
    let id = clientIds.get(item.key);
    if (!id) {
      id = newExpenseId(Date.now());
      clientIds.set(item.key, id);
    }
    return id;
  }

  /** Ghi MỘT giao dịch (không thông báo, không tải lại). */
  async function save(item: FundPayTarget, amount: number) {
    try {
      await saveFundTxnSynced({
        clientId: clientIdFor(item),
        kind: item.kind,
        expenseId: item.kind === 'payout' ? item.expenseId : undefined,
        advanceId: item.expenseId && item.kind === 'payout' ? undefined : item.advanceId,
        toFunder: item.toFunder,
        amount,
        date: todayStr(),
      });
      clientIds.delete(item.key); // lần thanh toán tiếp theo của khoản này là giao dịch mới
    } catch (e) {
      throw e instanceof FundInputError ? new PayInputError(e.message) : e;
    }
  }

  return {
    async pay(item: FundPayTarget, amount: number) {
      await save(item, amount);
      toast.show(item.kind === 'payout' ? 'Đã ghi nhận thanh toán' : 'Đã ghi nhận hoàn tiền');
      await reload();
    },
    /** Ghi lần lượt nhiều phần của một lần thanh toán gộp (đã chia theo `planCombinedPayout`); báo và tải lại một lần ở cuối, kể cả khi dừng giữa chừng vì lỗi (các phần đã ghi giữ nguyên). */
    async payMany(parts: readonly { target: FundPayTarget; amount: number }[]) {
      try {
        for (const part of parts) await save(part.target, part.amount);
      } finally {
        await reload();
      }
      toast.show('Đã ghi nhận thanh toán');
    },
  };
}

/** Bảng thanh toán một khoản quỹ: hai nút toàn bộ / một phần (chỉ giới hạn bởi số còn nợ / còn giữ, không theo số còn lại của quỹ). */
export function FundPayPanel({
  item,
  payer,
  receiver,
  onPay,
  onDone,
  onFailure,
}: {
  item: FundPayTarget;
  payer: string;
  receiver: string;
  onPay: (amount: number) => Promise<void>;
  onDone: () => void;
  onFailure: (e: unknown) => void;
}) {
  const limited = item.remaining;
  const partialOfRemaining = item.kind === 'payout' && limited < item.remaining;
  const choices: PayChoice[] = [
    { id: 'max', label: partialOfRemaining ? 'Thanh toán tối đa' : 'Thanh toán toàn bộ', amount: limited },
    { id: 'partial', label: 'Thanh toán một phần', max: limited, placeholder: 'Số tiền thanh toán' },
  ];
  return (
    <PaymentPanel
      remaining={limited}
      choices={choices}
      payer={payer}
      receiver={receiver}
      warning={partialOfRemaining ? `Quỹ chỉ có thể quyết toán tối đa ${formatVnd(limited)}` : undefined}
      onPay={(amount) => onPay(amount)}
      onDone={onDone}
      onFailure={onFailure}
    />
  );
}

interface FlowProps {
  data: FundData;
  person: string;
  /** `all` hoặc id quỹ. */
  scope: string;
  /** Chỉ các khoản của một phía: 'owed' = quỹ trả cá nhân, 'held' = hoàn tiền ứng; bỏ trống = cả hai. */
  side?: PersonDebtSide;
  reload: () => Promise<void> | void;
  /** Đóng cả luồng (sau khi ghi xong hoặc đóng tờ). */
  onClose: () => void;
  /** Trang "Quỹ nợ": có thì tờ thanh toán có thêm nút "Chọn các khoản thanh toán" (trang vào chế độ tích chọn các khoản quỹ nợ). */
  onSelectItems?: () => void;
}

/**
 * Luồng thanh toán công nợ quỹ của MỘT người, mở bằng nút Thanh toán ở trang chi tiết công nợ quỹ (như trang Thanh toán bill): nếu người đó có nhiều khoản cần xử lý
 * thì tờ nổi "Chọn khoản thanh toán" hiện trước (chọn một khoản thì tờ đó xuống, nền mờ đứng yên rồi tờ thanh toán lên); chỉ một khoản thì vào thẳng tờ thanh toán toàn bộ / một phần.
 * Ghi xong thì đóng luồng và trang chi tiết ở lại, cập nhật số liệu.
 */
export function FundPayFlow(props: FlowProps) {
  return props.side === 'owed' ? <FundOwedFlow {...props} /> : <FundSingleFlow {...props} />;
}

/**
 * Trang "Quỹ nợ": các khoản quỹ nợ người đó được GỘP thành MỘT lần thanh toán, không chọn từng khoản. Toàn bộ = trả hết số trả được ngay (tối đa bằng tổng còn nợ);
 * một phần = nhập số, ưu tiên khoản CŨ NHẤT trước rồi lần lượt các khoản sau cho đến hết (`planCombinedPayout`).
 */
function FundOwedFlow({ data, person, scope, reload, onClose, onSelectItems }: FlowProps) {
  const colors = useColors();
  const toast = useToast();
  const { payMany } = useFundPay(reload);
  const owed = fundPersonTargets(data, scope, person).filter((item) => item.kind === 'payout');
  const limit = combinedPayoutLimit(owed);
  if (limit <= 0) return null;

  const totalOwed = owed.reduce((sum, item) => sum + item.remaining, 0);
  const funds = [...new Set(owed.map((item) => item.fundId))];
  const payer = funds.length === 1 ? (data.funds.find((fund) => fund.id === funds[0])?.name ?? 'Quỹ') : 'Quỹ';
  const limited = limit < totalOwed;
  const choices: PayChoice[] = [
    { id: 'max', label: limited ? 'Thanh toán tối đa' : 'Thanh toán toàn bộ', amount: limit },
    { id: 'partial', label: 'Thanh toán một phần', max: limit, placeholder: 'Số tiền thanh toán' },
  ];
  return (
    <PaymentSheet heading={`${payer} trả ${person}`} amountText={formatVnd(limit)} amountColor={colors.danger} onClose={onClose}>
      <PaymentPanel
        remaining={limit}
        choices={choices}
        payer={payer}
        receiver={person}
        onSelectItems={onSelectItems}
        warning={limited ? `Quỹ chỉ có thể quyết toán tối đa ${formatVnd(limit)}` : undefined}
        onPay={(amount) => payMany(planCombinedPayout(owed, amount))}
        onDone={onClose}
        onFailure={(e) => toast.show(describeFundError(e))}
      />
    </PaymentSheet>
  );
}

function FundSingleFlow({ data, person, scope, side, reload, onClose }: FlowProps) {
  const colors = useColors();
  const toast = useToast();
  const { pay } = useFundPay(reload);
  const targets = fundPersonTargets(data, scope, person).filter((item) => !isFundPayBlocked(item) && (!side || (item.kind === 'payout') === (side === 'owed')));
  const [pickedKey, setPickedKey] = useState<string | null>(() => (targets.length === 1 ? targets[0].key : null));
  /** Đang chuyển từ tờ chọn khoản sang tờ thanh toán: tờ chọn đóng xong thì KHÔNG đóng cả luồng. */
  const switching = useRef(false);
  const fundName = (id: string) => data.funds.find((fund) => fund.id === id)?.name ?? 'Quỹ';

  const target = targets.find((item) => item.key === pickedKey) ?? null;
  if (targets.length === 0) return null;

  if (!target) {
    return (
      <SheetFrame
        onClose={() => {
          if (!switching.current) onClose();
        }}
      >
        <View style={styles.chooser}>
          <SheetHeader title="Chọn khoản thanh toán" />
          <ChooserRows
            targets={targets}
            fundName={fundName}
            onPick={(key, hide) => {
              switching.current = true;
              hide(() => {
                switching.current = false;
                setPickedKey(key);
              }, true);
            }}
          />
        </View>
      </SheetFrame>
    );
  }

  return (
    <PaymentSheet
      heading={target.kind === 'payout' ? `${fundName(target.fundId)} trả ${person}` : `${person} hoàn tiền cho ${fundName(target.fundId)}`}
      amountText={formatVnd(target.remaining)}
      amountColor={target.kind === 'refund' ? colors.success : colors.danger}
      onClose={onClose}
    >
      <FundPayPanel
        key={target.key}
        item={target}
        payer={target.kind === 'payout' ? fundName(target.fundId) : person}
        receiver={target.kind === 'payout' ? person : fundName(target.fundId)}
        onPay={(amount) => pay(target, amount)}
        onDone={onClose}
        onFailure={(e) => toast.show(describeFundError(e))}
      />
    </PaymentSheet>
  );
}

function ChooserRows({
  targets,
  fundName,
  onPick,
}: {
  targets: readonly FundPayTarget[];
  fundName: (id: string) => string;
  onPick: (key: string, hide: (after?: () => void, keepScrim?: boolean) => void) => void;
}) {
  const colors = useColors();
  const hide = useSheetClose();
  return (
    <View style={styles.rows}>
      {targets.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={`${FUND_PAY_KIND_LABEL[item.kind]} ${item.title}, ${formatVnd(item.remaining)}`}
          onPress={() => onPick(item.key, hide)}
          style={({ pressed }) => [styles.row, { backgroundColor: colors.bg, opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={styles.flex}>
            <AppText weight="semibold" style={styles.name} numberOfLines={2}>
              {item.title || 'Không tên'}
            </AppText>
            <AppText color={colors.muted} style={styles.note}>
              {FUND_PAY_KIND_LABEL[item.kind]} · {fundName(item.fundId)}
            </AppText>
          </View>
          <AppText weight="bold" color={item.kind === 'payout' ? colors.danger : colors.warning} style={styles.amount}>
            {formatVnd(item.remaining)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  chooser: { gap: 12 },
  rows: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 12 },
  name: { fontSize: 15.5, lineHeight: 21 },
  note: { fontSize: 12.5, lineHeight: 17 },
  amount: { fontSize: 16, lineHeight: 22 },
});
