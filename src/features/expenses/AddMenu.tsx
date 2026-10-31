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
 * Menu của nút "+" ở giữa thanh tab dưới (có mặt ở mọi trang chính). Mở tờ chọn các lựa chọn: Chụp nhanh, Chi tiêu, Tạo bill, Chi tiêu quỹ (Thu quỹ nằm ở nút "+ Thu, chi quỹ" của trang một quỹ) — mỗi lựa chọn mở thẳng luồng nghiệp vụ hiện có
 * (không tạo luồng mới). "Chi tiêu quỹ": có đúng một quỹ thì vào thẳng trang riêng của form, nhiều quỹ thì mở tờ chọn quỹ trước. Đóng bằng chạm nền mờ, nút Back hoặc chọn một mục; nơi chứa giữ `open` và luôn dựng thành phần này
 * (để tờ chọn quỹ còn đó sau khi tờ menu đã đóng).
 */
export function AddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { period } = useSharedPeriod();
  const funds = useFundData().data.funds;
  const hasFunds = funds.length > 0;
  /** Tờ nổi chọn quỹ cho Chi tiêu quỹ. */
  const [fundSheet, setFundSheet] = useState(false);

  /** Đúng MỘT quỹ thì vào thẳng trang Chi tiêu quỹ của quỹ đó (không qua tờ chọn quỹ); nhiều quỹ thì mở tờ chọn quỹ trước. */
  const openFund = () => {
    if (funds.length === 1) router.push({ pathname: '/quy/chi-tieu', params: { fund: funds[0].id } });
    else setFundSheet(true);
  };

  const options: SheetOption[] = [
    { icon: 'camera', label: 'Chụp nhanh', hint: 'Chụp ảnh, gợi ý nội dung và số tiền', onPress: () => router.push('/chup-nhanh') },
    {
      icon: 'person',
      label: 'Chi tiêu',
      onPress: () => router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(period), d: suggestedDateFor(period, todayStr()) } }),
    },
    { icon: 'receipt', label: 'Tạo bill', onPress: () => router.push('/chia-bill/tao') },
    // Mục quỹ nằm cuối; chỉ khi chưa có quỹ nào mới có ghi chú nhỏ giải thích vì sao mờ.
    { icon: 'people', label: 'Chi tiêu quỹ', hint: hasFunds ? undefined : NO_FUND_HINT, disabled: !hasFunds, opensSheet: funds.length > 1, onPress: openFund },
  ];

  return (
    <>
      {open && <OptionSheet title="Chọn loại giao dịch" options={options} onClose={onClose} />}
      {fundSheet && <FundTxnSheet mode="chi" onClose={() => setFundSheet(false)} />}
    </>
  );
}
