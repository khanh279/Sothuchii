import { useState } from 'react';

import { OptionSheet, type SheetOption } from '@/components/option-sheet';
import { periodToParams, suggestedDateFor } from '@/domain/expenses';
import { useFundData } from '@/features/funds/hooks';
import { FundTxnSheet } from '@/features/funds/FundTxnSheet';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { todayStr } from '@/utils/date';
import { router } from '@/utils/safe-router';

const NO_FUND_HINT = 'Chưa có quỹ — tạo quỹ ở tab Quỹ nhóm';

/**
 * Menu của nút "+" ở giữa thanh tab dưới (có mặt ở mọi trang chính). Mở tờ chọn năm lựa chọn: Chi tiêu, Giao dịch, Tạo bill, Thu quỹ, Chi tiêu quỹ — mỗi lựa chọn mở thẳng luồng nghiệp vụ hiện có
 * (không tạo luồng mới). "Thu quỹ" và "Chi tiêu quỹ": có đúng một quỹ thì vào thẳng trang riêng của form, nhiều quỹ thì mở tờ chọn quỹ trước. Đóng bằng chạm nền mờ, nút Back hoặc chọn một mục; nơi chứa giữ `open` và luôn dựng thành phần này
 * (để tờ chọn quỹ còn đó sau khi tờ menu đã đóng).
 */
export function AddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { period } = useSharedPeriod();
  const funds = useFundData().data.funds;
  const hasFunds = funds.length > 0;
  /** Tờ nổi chọn quỹ cho Thu quỹ / Chi tiêu quỹ. */
  const [fundSheet, setFundSheet] = useState<'thu' | 'chi' | null>(null);

  /** Đúng MỘT quỹ thì vào thẳng trang Thu quỹ / Chi tiêu quỹ của quỹ đó (không qua tờ chọn quỹ); nhiều quỹ thì mở tờ chọn quỹ trước. */
  const openFund = (mode: 'thu' | 'chi') => {
    if (funds.length === 1) router.push({ pathname: mode === 'thu' ? '/quy/thu-quy' : '/quy/chi-tieu', params: { fund: funds[0].id } });
    else setFundSheet(mode);
  };

  const options: SheetOption[] = [
    {
      icon: 'person',
      label: 'Chi tiêu',
      onPress: () => router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(period), d: suggestedDateFor(period, todayStr()) } }),
    },
    { icon: 'tabTransactions', label: 'Giao dịch', onPress: () => router.push('/cong-no/ghi-nhan') },
    { icon: 'receipt', label: 'Tạo bill', onPress: () => router.push('/chia-bill/tao') },
    // Hai mục quỹ nằm cuối; chỉ khi chưa có quỹ nào mới có ghi chú nhỏ giải thích vì sao mờ.
    { icon: 'wallet', label: 'Thu quỹ', hint: hasFunds ? undefined : NO_FUND_HINT, disabled: !hasFunds, opensSheet: funds.length > 1, onPress: () => openFund('thu') },
    { icon: 'people', label: 'Chi tiêu quỹ', hint: hasFunds ? undefined : NO_FUND_HINT, disabled: !hasFunds, opensSheet: funds.length > 1, onPress: () => openFund('chi') },
  ];

  return (
    <>
      {open && <OptionSheet title="Chọn loại giao dịch" options={options} onClose={onClose} />}
      {fundSheet && <FundTxnSheet mode={fundSheet} onClose={() => setFundSheet(null)} />}
    </>
  );
}
