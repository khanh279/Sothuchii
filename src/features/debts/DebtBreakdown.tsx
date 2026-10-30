import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { buildBillPairItems, buildBillPairs, type BillPair, type BillPairItem } from '@/domain/billPairs';
import type { Tone, buildDebtDetail } from '@/domain/debtDetail';
import { BillItemsList, type BillSelection } from '@/features/bills/BillItemsList';
import { LoanLinesList } from '@/features/debts/LoanLinesList';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Pay } from '@/types/pay';
import { useColors } from '@/hooks/use-colors';
import { roundVnd } from '@/domain/money';
import { formatVnd } from '@/utils/format';
import { DEBT_ZERO, debtEvents, loanLines, type LoanLine } from '@/domain/ledger';

const SIGN = { get: '+', owe: '−', mid: '' } as const;

/** Danh sách trong hai ngăn luôn là toàn bộ thời gian, như hai trang riêng. */
const ALL_TIME: Period = { mode: 'all' };

export interface PersonDebtLists {
  loanList: LoanLine[];
  pair: BillPair | null;
  billItems: BillPairItem[];
}

interface Props {
  detail: ReturnType<typeof buildDebtDetail>;
  /** Hai danh sách khoản vay / khoản bill (xem `usePersonDebtLists`). */
  lists: PersonDebtLists;
  /** Chế độ chọn khoản để thanh toán: có thì hai ngăn mở hết và mỗi khoản có ô tích. */
  selection?: { bills: BillSelection; loans: { selected: ReadonlySet<number>; onToggle: (index: number) => void } };
  /** Mở sẵn hai ngăn Nợ vay / Nợ bill (mặc định gập). */
  defaultOpen?: boolean;
}

/** Tóm tắt tổng nợ hiện tại với một người (vay + bill) cho khung trang thanh toán: số có dấu, màu theo quy ước và chú thích chiều nợ. */
export function debtTotalSummary(detail: ReturnType<typeof buildDebtDetail>): { amount: string; tone: 'owe' | 'get' | 'mid'; caption: string } {
  const total = roundVnd(detail.loan + detail.bill);
  const tone = total > DEBT_ZERO ? 'get' : total < -DEBT_ZERO ? 'owe' : 'mid';
  const sign = tone === 'get' ? '+' : tone === 'owe' ? '−' : '';
  const caption = detail.settled ? 'Không còn nợ' : tone === 'owe' ? `Tôi nợ ${detail.name}` : tone === 'get' ? `${detail.name} nợ tôi` : 'Hai khoản nợ bù nhau';
  return { amount: `${sign}${formatVnd(Math.abs(total))}`, tone, caption };
}

/**
 * Hai ngăn chi tiết nợ với MỘT người: Nợ vay và Nợ bill, thu gọn sẵn. Khi mở (hoặc khi đang chọn khoản để thanh toán), mỗi ngăn hiện NGUYÊN danh sách của trang riêng (`LoanLinesList` của trang Chi tiết nợ vay, `BillItemsList` của trang
 * Thanh toán bill); số dư ở đầu ngăn lấy từ `buildDebtDetail`. Dùng chung cho màn Chi tiết nợ và trang Thanh toán công nợ; chỉ hiển thị, không ghi dữ liệu.
 */
export function DebtBreakdown({ detail, lists, selection, defaultOpen = false }: Props) {
  const [open, setOpen] = useState<{ loan?: boolean; bill?: boolean }>(defaultOpen ? { loan: true, bill: true } : {});
  const { loanList, pair, billItems } = lists;
  // Đang chọn khoản để thanh toán: hai ngăn mở hết, hiện đủ mọi khoản (không thu gọn nữa) và không đóng lại được cho tới khi thoát chế độ chọn.
  const selecting = !!selection;
  const isOpen = (key: 'loan' | 'bill') => selecting || !!open[key];
  return (
    <>
      {detail.hasLoan && (
        <Stack2 label="Nợ vay" sub={detail.loanSubtitle} balance={detail.loan} open={isOpen('loan')} onToggle={() => !selecting && setOpen({ ...open, loan: !open.loan })}>
          {loanList.length === 0 ? <Empty text="Không còn khoản vay nào chưa thanh toán" /> : <LoanLinesList lines={loanList} selection={selection?.loans} />}
        </Stack2>
      )}

      {detail.hasBill && (
        <Stack2 divider={detail.hasLoan} label="Nợ bill" sub={detail.billSubtitle} balance={detail.bill} open={isOpen('bill')} onToggle={() => !selecting && setOpen({ ...open, bill: !open.bill })}>
          {pair && billItems.length > 0 ? <BillItemsList pair={pair} items={billItems} selection={selection?.bills} /> : <Empty text="Không còn khoản nào cần thanh toán" />}
        </Stack2>
      )}
    </>
  );
}

/**
 * Hai danh sách của một người, đúng nguồn với hai trang riêng: khoản vay (như trang Chi tiết nợ vay) và khoản bill của cặp (Tôi, người đó) còn nợ, toàn thời gian (như trang Thanh toán bill).
 * Trang chi tiết dùng cùng bộ dữ liệu này để hiện danh sách và để tính các khoản được chọn.
 */
export function usePersonDebtLists(bills: readonly Bill[], pays: readonly Pay[], name: string): PersonDebtLists {
  return useMemo(() => {
    const loanList = loanLines(debtEvents(bills, pays), name);
    const pair = buildBillPairs(bills, pays, ALL_TIME).find((item) => (item.from === BILL_OWNER_NAME && item.to === name) || (item.to === BILL_OWNER_NAME && item.from === name)) ?? null;
    const billItems = pair ? buildBillPairItems(bills, pays, pair).filter((item) => item.remaining > 0) : [];
    return { loanList, pair, billItems };
  }, [bills, pays, name]);
}

function Empty({ text }: { text: string }) {
  const colors = useColors();
  return (
    <AppText color={colors.muted} style={styles.empty}>
      {text}
    </AppText>
  );
}

function Amount({ value, tone }: { value: number; tone?: Tone }) {
  const colors = useColors();
  const resolved: Tone = tone ?? (value > 0.5 ? 'get' : value < -0.5 ? 'owe' : 'mid');
  return (
    <AppText weight="bold" color={resolved === 'mid' ? colors.muted : resolved === 'get' ? colors.success : colors.danger} style={styles.amount}>
      {SIGN[resolved]}
      {formatVnd(Math.abs(value))}
    </AppText>
  );
}

/** Một ngăn Nợ vay / Nợ bill phẳng (không thẻ riêng): nằm trong khung trang, ngăn thứ hai có đường kẻ mảnh phía trên. */
function Stack2({ label, sub, balance, open, onToggle, divider = false, children }: { label: string; sub: string; balance: number; open: boolean; onToggle: () => void; divider?: boolean; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.stack, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.stackHead}>
        <View style={styles.flex}>
          <AppText weight="bold" style={styles.stackTitle}>
            {label}
          </AppText>
          <AppText color={colors.muted} style={styles.small}>
            {sub}
          </AppText>
        </View>
        <Amount value={balance} />
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <SvgIcon name="chevronRight" size={16} color={colors.muted} />
        </View>
      </Pressable>
      {open && <View style={styles.stackBody}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  small: { fontSize: 12.5, lineHeight: 17 },
  empty: { textAlign: 'center', fontSize: 14, paddingVertical: 12 },
  stack: { overflow: 'hidden' },
  stackHead: { minHeight: 52, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stackTitle: { fontSize: 15.5 },
  stackBody: { paddingBottom: 4 },
  amount: { fontSize: 16 },
});
