// Jest chạy trên Node nhưng dự án không cài kiểu của Node, nên khai báo tối thiểu những gì test cần.
declare const require: (name: string) => any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Chạy public/sw.js trong một môi trường giả (self, caches, fetch) để kiểm tra logic bộ nhớ đệm mà không cần trình duyệt.
const source = fs.readFileSync(path.join(__dirname, '../../public/sw.js'), 'utf8').replace("'__BUILD__'", "'test'");

type Handler = (event: unknown) => void;

function setup(files: Record<string, string>, online = true) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, string>>();
  const state = { online };
  const cacheOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const map = store.get(name) as Map<string, string>;
    return {
      put: async (key: unknown, response: { text: () => Promise<string> }) => void map.set(String((key as { url?: string }).url ?? key), await response.text()),
      add: async (url: string) => {
        if (!(url in files)) throw new Error('404');
        map.set(url, files[url]);
      },
      match: async (key: unknown) => {
        const hit = map.get(String((key as { url?: string }).url ?? key));
        return hit === undefined ? undefined : { ok: true, text: async () => hit, clone: () => ({ text: async () => hit }) };
      },
    };
  };
  const response = (body: string) => ({ ok: true, type: 'basic', text: async () => body, clone: () => response(body) });
  const context = {
    self: {
      registration: { scope: 'https://x.test/app/' },
      location: { origin: 'https://x.test' },
      addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: { open: async (name: string) => cacheOf(name), keys: async () => [...store.keys()], delete: async (name: string) => store.delete(name) },
    fetch: async (request: unknown) => {
      const url = typeof request === 'string' ? request : (request as { url: string }).url;
      if (!state.online || !(url in files)) throw new Error('offline');
      return response(files[url]);
    },
    URL,
    Promise,
    Set,
  };
  vm.runInNewContext(source, context);
  const wait = async (fn: (event: { waitUntil: (p: Promise<unknown>) => void }) => void) => {
    let pending: Promise<unknown> = Promise.resolve();
    fn({ waitUntil: (p) => void (pending = p) });
    await pending;
  };
  const respond = async (request: { url: string; method?: string; mode?: string }) => {
    let result: Promise<{ text: () => Promise<string> }> | undefined;
    handlers.fetch({ request: { method: 'GET', mode: 'cors', ...request }, respondWith: (p: Promise<{ text: () => Promise<string> }>) => void (result = p) });
    return result;
  };
  return { handlers, store, state, wait, respond };
}

const FILES = {
  'https://x.test/app/': '<html><script src="/app/_expo/static/js/main-abc.js"></script><link href="/app/icons/icon-192.png"/><link href="https://cdn.other/x.css"/></html>',
  'https://x.test/app/manifest.json': '{}',
  'https://x.test/app/_expo/static/js/main-abc.js': 'console.log(1)',
  'https://x.test/app/icons/icon-192.png': 'png',
};

describe('service worker', () => {
  it('cài đặt: lưu sẵn trang gốc, manifest và các file cùng nguồn trang gốc dùng (bỏ file ngoài nguồn)', async () => {
    const sw = setup(FILES);
    await sw.wait(sw.handlers.install as never);
    const cached = [...(sw.store.get('sothuchi-test') as Map<string, string>).keys()].sort();
    expect(cached).toEqual(['https://x.test/app/', 'https://x.test/app/_expo/static/js/main-abc.js', 'https://x.test/app/icons/icon-192.png', 'https://x.test/app/manifest.json']);
  });

  it('mất mạng: trang mở từ bản đã lưu (kể cả địa chỉ con không có sẵn thì dùng trang gốc); file tĩnh lấy từ bộ nhớ đệm', async () => {
    const sw = setup(FILES);
    await sw.wait(sw.handlers.install as never);
    sw.state.online = false;
    expect(await (await sw.respond({ url: 'https://x.test/app/', mode: 'navigate' }))?.text()).toContain('main-abc.js');
    expect(await (await sw.respond({ url: 'https://x.test/app/cong-no/chi-tiet', mode: 'navigate' }))?.text()).toContain('main-abc.js');
    expect(await (await sw.respond({ url: 'https://x.test/app/_expo/static/js/main-abc.js' }))?.text()).toBe('console.log(1)');
  });

  it('có mạng: trang luôn lấy bản mới; chỉ xử lý GET cùng nguồn trong phạm vi', async () => {
    const files = { ...FILES };
    const sw = setup(files);
    await sw.wait(sw.handlers.install as never);
    files['https://x.test/app/'] = '<html>moi</html>';
    expect(await (await sw.respond({ url: 'https://x.test/app/', mode: 'navigate' }))?.text()).toBe('<html>moi</html>');
    expect(await sw.respond({ url: 'https://x.test/app/api', method: 'POST' })).toBeUndefined();
    expect(await sw.respond({ url: 'https://other.test/app/x.js' })).toBeUndefined();
    expect(await sw.respond({ url: 'https://x.test/khac/x.js' })).toBeUndefined();
  });

  it('kích hoạt: xoá bộ nhớ đệm của bản cũ, giữ bản hiện tại và bộ nhớ không thuộc app', async () => {
    const sw = setup(FILES);
    await sw.wait(sw.handlers.install as never);
    sw.store.set('sothuchi-old', new Map());
    sw.store.set('khac', new Map());
    await sw.wait(sw.handlers.activate as never);
    expect([...sw.store.keys()].sort()).toEqual(['khac', 'sothuchi-test']);
  });
});
