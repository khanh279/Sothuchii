import { act, create } from 'react-test-renderer';

import { saveJsonStrict, saveManyJsonStrict } from '@/data/storage';

import { useReloadOnWrite } from './use-reload-on-write';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ keys, reload }: { keys: readonly string[]; reload: () => void }) {
  useReloadOnWrite(keys, reload);
  return null;
}

const flush = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 5)));

describe('useReloadOnWrite', () => {
  it('ghi đúng khóa đang theo dõi thì tải lại; khóa khác thì không', async () => {
    const reload = jest.fn();
    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Probe keys={['a', 'm:*']} reload={reload} />);
    });

    await act(async () => saveJsonStrict('b', 1));
    await flush();
    expect(reload).not.toHaveBeenCalled();

    await act(async () => saveJsonStrict('a', 1));
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);

    await act(async () => saveJsonStrict('m:2025-10', 1));
    await flush();
    expect(reload).toHaveBeenCalledTimes(2);

    await act(async () => tree.unmount());
  });

  it('nhiều khóa ghi cùng lúc chỉ tải lại một lần', async () => {
    const reload = jest.fn();
    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Probe keys={['x', 'y']} reload={reload} />);
    });
    await act(async () =>
      saveManyJsonStrict([
        ['x', 1],
        ['y', 2],
      ]),
    );
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  it('gỡ màn hình thì không tải lại nữa', async () => {
    const reload = jest.fn();
    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Probe keys={['k']} reload={reload} />);
    });
    await act(async () => tree.unmount());
    await act(async () => saveJsonStrict('k', 1));
    await flush();
    expect(reload).not.toHaveBeenCalled();
  });
});
