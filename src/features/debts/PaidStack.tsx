import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ConfirmDialog } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { loanKey, paidLoanViews } from '@/domain/loanAllocation';
import type { BillPairItem } from '@/domain/billPairs';
import { BillItemsList } from '@/features/bills/BillItemsList';
import type { PersonDebtLists } from '@/features/debts/DebtBreakdown';
import { LoanLinesList } from '@/features/debts/LoanLinesList';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useToast } from '@/components/toast';
import { loadSettings } from '@/data/expenseRepository';
import { useColors } from '@/hooks/use-colors';

/** Số khoá "đã ẩn" tối đa lưu trong thiết lập (giữ các khoá mới nhất) để thiết lập không phình ra mãi. */
const MAX_HIDDEN = 500;

/**
 * Các khoản đã thanh toán người dùng đã chọn "Xóa lịch sử" ở ngăn xếp (chỉ ẨN khỏi ngăn xếp, dữ liệu và lịch sử giao dịch giữ nguyên). Lưu danh sách khoá trong thiết lập (`hiddenPaid`) nên được sao lưu cùng.
 * Khoá: khoản vay `loan:<mã khoản gốc>`, khoản bill `bill:<mã cặp>:<mã bill>`.
 */
export function useHiddenPaid(): { hidden: ReadonlySet<string>; hide: (keys: readonly string[]) => Promise<void>; unhide: (keys: readonly string[]) => Promise<void> } {
  const { settings, save } = useExpenseSettings();
  const hidden = new Set(settings.hiddenPaid ?? []);
  return {
    hidden,
    hide: async (keys) => {
      const merged = [...new Set([...(settings.hiddenPaid ?? []), ...keys])].slice(-MAX_HIDDEN);
      await save({ ...settings, hiddenPaid: merged });
    },
    // Hoàn tác "Xóa lịch sử": đọc lại thiết lập mới nhất (đã đổi sau lúc ẩn) rồi bỏ đúng các khoá vừa ẩn.
    unhide: async (keys) => {
      const current = await loadSettings();
      const drop = new Set(keys);
      await save({ ...current, hiddenPaid: (current.hiddenPaid ?? []).filter((key) => !drop.has(key)) });
    },
  };
}

/**
 * Thẻ "Đã thanh toán (N)" ở CUỐI trang, tách riêng khỏi thẻ nợ phía trên (một thẻ chung cho mọi khoản đã trả của trang): thu gọn sẵn, bấm để xem các khoản đã trả xong (gạch ngang) và nút "Xóa lịch sử" để ẩn chúng khỏi ngăn xếp (có hỏi xác nhận; dữ liệu giữ nguyên).
 * Không có khoản nào thì không hiện. `children` là danh sách các khoản đã trả; `onClear` ẩn đúng các khoản đó.
 */
/**
 * Thẻ "Đã thanh toán" của trang nợ với MỘT người: gom MỌI khoản đã trả xong của cả nợ vay và nợ bill vào một thẻ riêng ở cuối trang (nhóm "Nợ vay" rồi "Nợ bill"); "Xóa lịch sử" ẩn cả hai nhóm.
 */
export function PersonPaidCard({ lists }: { lists: PersonDebtLists }) {
  const colors = useColors();
  const { hidden } = useHiddenPaid();
  const paidLoans = paidLoanViews(lists.loanList, hidden);
  const billKey = (item: BillPairItem) => `bill:${lists.pair?.key}:${item.billId}`;
  const paidBills = lists.paidBillItems.filter((item) => !hidden.has(billKey(item)));
  const group = (title: string) => (
    <AppText weight="semibold" color={colors.muted} style={styles.group}>
      {title}
    </AppText>
  );
  return (
    <PaidStack count={paidLoans.length + paidBills.length} keys={[...paidLoans.flatMap((view) => loanKey(view) ?? []), ...paidBills.map(billKey)]}>
      {paidLoans.length > 0 && (
        <>
          {group('Nợ vay')}
          <LoanLinesList views={lists.loanList} mode="paid" hidden={hidden} />
        </>
      )}
      {paidBills.length > 0 && lists.pair && (
        <>
          {group('Nợ bill')}
          <BillItemsList pair={lists.pair} items={paidBills} />
        </>
      )}
    </PaidStack>
  );
}

/** `keys`: khoá các khoản đã trả đang hiện, dùng để ẩn (và hoàn tác ẩn) khi "Xóa lịch sử". */
export function PaidStack({ count, keys, children }: { count: number; keys: readonly string[]; children: ReactNode }) {
  const colors = useColors();
  const toast = useToast();
  const { hide, unhide } = useHiddenPaid();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (count <= 0) return null;
  return (
    <View style={[styles.stack, { backgroundColor: colors.surface }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.head}>
        <AppText weight="semibold" color={colors.muted} style={styles.title}>
          Đã thanh toán ({count})
        </AppText>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
        </View>
      </Pressable>
      {open && (
        <>
          {children}
          <Pressable accessibilityRole="button" accessibilityLabel="Xóa lịch sử" onPress={() => setConfirm(true)} style={styles.clear}>
            <AppText weight="semibold" color={colors.danger} style={styles.clearText}>
              Xóa lịch sử
            </AppText>
          </Pressable>
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title="Xóa lịch sử đã thanh toán"
          message={`Ẩn ${count} khoản đã thanh toán khỏi danh sách này.`}
          note="Chỉ ẩn khỏi danh sách này; dữ liệu và lịch sử giao dịch vẫn giữ nguyên."
          confirmLabel="Xóa"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await hide(keys);
              setConfirm(false);
              toast.show(`Đã xóa lịch sử ${count} khoản đã thanh toán`, {
                action: {
                  label: 'Hoàn tác',
                  onPress: () => {
                    void unhide(keys).catch(() => toast.show('Không hoàn tác được. Hãy thử lại.'));
                  },
                },
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { borderRadius: AppRadius.card, paddingHorizontal: 16 },
  head: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 14 },
  group: { fontSize: 12.5, lineHeight: 17, marginTop: 4 },
  clear: { alignSelf: 'center', minHeight: 40, paddingHorizontal: 16, justifyContent: 'center' },
  clearText: { fontSize: 14 },
});
