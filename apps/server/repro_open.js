const jsdom = require('jsdom');
const WebSocket = require('ws');
const JSDOM = new jsdom.JSDOM('', { url: 'https://im.chaoxing.com/webim/me' });
const setG = (n, v) => { try { Object.defineProperty(globalThis, n, { configurable: true, enumerable: true, writable: true, value: v }); } catch { globalThis[n] = v; } };
setG('window', JSDOM.window);
setG('WebSocket', WebSocket);
setG('navigator', JSDOM.window.navigator);
setG('location', JSDOM.window.location);

const webIM = require('./src/utils/websdk3.1.4.js').default;
const conn = new webIM.connection({
  isMultiLoginSessions: true, https: true,
  url: 'https://im-api-vip6-v2.easecdn.com/ws',
  apiUrl: 'https://a1-vip6.easecdn.com',
  isAutoLogin: true, heartBeatWait: 4500,
  autoReconnectNumMax: 2, autoReconnectInterval: 2,
  appKey: 'cx-dev#cxstudy', isHttpDNS: false,
});

const GARBAGE = '/DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">\r\n';
const mode = process.argv[2] || 'garbage';
const user = mode === 'valid' ? 'abc123validuser' : GARBAGE;

console.log('[repro] mode=', mode, 'user=', JSON.stringify(user.slice(0, 40)));

conn.listen({
  onOpened: () => console.log('[repro] onOpened'),
  onClosed: () => console.log('[repro] onClosed'),
  onError: (m) => console.log('[repro] onError', m),
  onTextMessage: (m) => console.log('[repro] onTextMessage'),
});

try {
  const r = conn.open({ apiUrl: 'https://a1-vip6.easecdn.com', user, accessToken: 'x'.repeat(30), appKey: 'cx-dev#cxstudy' });
  console.log('[repro] open() returned:', r && typeof r.then === 'function' ? 'Promise' : String(r));
  if (r && typeof r.then === 'function') r.catch(e => console.log('[repro] open rejected:', e && e.message));
} catch (e) {
  console.log('[repro] open() THREW synchronously:', e.message);
}
console.log('[repro] after open()');
const t0 = Date.now();
process.on('exit', (c) => console.log('[repro] EXIT code=', c, 'after', Date.now() - t0, 'ms'));
