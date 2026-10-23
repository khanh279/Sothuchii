import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { addPersonToList, loadPeople, removePersonFromList } from '@/data/peopleRepository';
import { StorageCorruptError, StorageKeys } from '@/data/storage';
import { useReloadOnWrite } from '@/hooks/use-reload-on-write';
import type { AddPersonResult } from '@/domain/people';

/** Danh sách người dùng chung; tự đọc lại mỗi khi màn hình được mở lại. */
export function usePeople() {
  const [people, setPeople] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setPeople(await loadPeople());
      setError(null);
    } catch (e) {
      setError(
        e instanceof StorageCorruptError
          ? 'Danh sách người trên máy bị hỏng nên chưa thể mở. App không ghi đè lên dữ liệu này.'
          : 'Không đọc được danh sách người. Hãy thử lại.',
      );
    }
  }, []);

  // Có ai ghi danh sách người (kể cả từ màn hình khác) thì tải lại ngay.
  useReloadOnWrite([StorageKeys.people], reload);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const add = useCallback(
    async (name: string): Promise<AddPersonResult> => {
      const result = await addPersonToList(name);
      await reload();
      return result;
    },
    [reload],
  );

  const remove = useCallback(
    async (name: string) => {
      await removePersonFromList(name);
      await reload();
    },
    [reload],
  );

  return { people, error, add, remove, reload };
}
