import { useState } from 'react';

import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { deleteExpenseUndoable } from '@/data/expenseRepository';
import { periodToParams } from '@/domain/expenses';
import { linkedExpenseNotice } from '@/domain/linkedExpense';
import { describeStorageError } from '@/features/expenses/hooks';
import type { ExpenseWithId, Period } from '@/types/expense';
import { monthOf } from '@/utils/date';
import { router } from '@/utils/safe-router';

/**
 * Thao tác trên một dòng khoản chi (mở chi tiết, sửa, xoá có hoàn tác) dùng chung cho Lịch sử và tab Chi tiêu.
 * Khoản chi tự sinh (`src:'cb'` / `'quy'`) vẫn không được sửa/xoá trực tiếp: chỉ hiện câu giải thích (`linkedExpenseNotice`).
 */
export function useExpenseRowActions({ period, reload }: { period: Period; reload: () => Promise<void> | void }) {
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);

  async function remove(item: ExpenseWithId) {
    const notice = linkedExpenseNotice(item);
    if (notice) {
      setOpenId(null);
      toast.show(notice, { bottom: TOAST_BOTTOM_HISTORY });
      return;
    }
    try {
      const undo = await deleteExpenseUndoable({ m: monthOf(item.d), id: item.id });
      setOpenId(null);
      toast.show('Đã xoá khoản chi', {
        bottom: TOAST_BOTTOM_HISTORY,
        action: undo
          ? {
              label: 'Hoàn tác',
              onPress: () => {
                undo()
                  .then(() => reload())
                  .catch((e) => toast.show(describeStorageError(e), { bottom: TOAST_BOTTOM_HISTORY }));
              },
            }
          : undefined,
      });
      await reload();
    } catch (e) {
      toast.show(describeStorageError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  function openDetail(item: ExpenseWithId) {
    router.push({ pathname: '/chi-tieu/chi-tiet', params: { m: monthOf(item.d), id: item.id } });
  }

  function edit(item: ExpenseWithId) {
    const notice = linkedExpenseNotice(item);
    if (notice) {
      toast.show(notice, { bottom: TOAST_BOTTOM_HISTORY });
      return;
    }
    router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(period), m: monthOf(item.d), id: item.id } });
  }

  return { openId, setOpenId, remove, edit, openDetail };
}
