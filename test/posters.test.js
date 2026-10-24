import test from 'node:test';
import assert from 'node:assert/strict';
import { mirrorPosters, posterPublicUrl } from '../lib/posters.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function imageResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name === 'content-type' ? 'image/jpeg' : null) },
    arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.byteLength),
    json: async () => ({}),
  };
}

test('a poster already in the bucket is not uploaded again', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' });
    if (String(url).includes('a.ltrbxd.com')) return imageResponse();
    if (String(url).includes('prefix=')) {
      const key = decodeURIComponent(String(url).split('prefix=')[1]);
      return jsonResponse({ result: [{ key }] });
    }
    return jsonResponse({}, 500);
  };
  const [watch] = await mirrorPosters(
    [{ title: 'Film', posterSource: 'https://a.ltrbxd.com/resized/x.jpg' }],
    { fetch: fetchImpl, token: 'token', accountId: 'account', warn() {} },
  );
  assert.equal(calls.some((call) => call.method === 'PUT'), false);
  assert.match(watch.poster, /^https:\/\/media\.mattdoes\.online\/posters\/[a-f0-9]{64}\.jpg$/);
});

test('a missing poster is uploaded once', async () => {
  let puts = 0;
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    if (String(url).includes('a.ltrbxd.com')) return imageResponse();
    if (method === 'PUT') {
      puts += 1;
      return jsonResponse({ success: true });
    }
    return jsonResponse({ result: [] });
  };
  const [watch] = await mirrorPosters(
    [{ title: 'Film', posterSource: 'https://a.ltrbxd.com/x.jpg' }],
    { fetch: fetchImpl, token: 'token', accountId: 'account', warn() {} },
  );
  assert.equal(puts, 1);
  assert.equal(watch.posterFull, watch.poster);
  assert.ok(watch.poster.startsWith(posterPublicUrl('posters/').slice(0, 40)));
});

test('a real poster is stored as a grid file and a scene file', async () => {
  const sharp = (await import('sharp')).default;
  const width = 1200;
  const height = 1800;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 3) {
    raw[i] = i % 255;
    raw[i + 1] = (i * 3) % 255;
    raw[i + 2] = (i * 7) % 255;
  }
  const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
  const puts = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    if (String(url).includes('a.ltrbxd.com')) {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name === 'content-type' ? 'image/jpeg' : null) },
        arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
        json: async () => ({}),
      };
    }
    if (method === 'PUT') {
      puts.push(init.headers?.['content-type'] || '');
      return jsonResponse({ success: true });
    }
    return jsonResponse({ result: [] });
  };
  const [watch] = await mirrorPosters(
    [{ title: 'Film', posterSource: 'https://a.ltrbxd.com/wide.jpg' }],
    { fetch: fetchImpl, token: 'token', accountId: 'account', warn() {} },
  );
  assert.equal(puts.length, 2);
  assert.deepEqual(puts, ['image/jpeg', 'image/jpeg']);
  assert.match(watch.poster, /^https:\/\/media\.mattdoes\.online\/posters\/[a-f0-9]{64}\.jpg$/);
  assert.match(watch.posterFull, /^https:\/\/media\.mattdoes\.online\/posters\/[a-f0-9]{64}\.jpg$/);
  assert.notEqual(watch.poster, watch.posterFull);
  assert.equal(watch.posterWidth, 500);
  assert.equal(watch.posterFullWidth, 960);
  assert.ok(watch.posterHeight > 0);
  assert.ok(watch.posterFullHeight > watch.posterHeight);
});

test('both poster sizes already in the bucket are not uploaded', async () => {
  const sharp = (await import('sharp')).default;
  const raw = Buffer.alloc(32 * 48 * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 13) % 256;
  const jpeg = await sharp(raw, { raw: { width: 32, height: 48, channels: 3 } }).jpeg().toBuffer();
  let puts = 0;
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    if (String(url).includes('a.ltrbxd.com')) {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name === 'content-type' ? 'image/jpeg' : null) },
        arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
        json: async () => ({}),
      };
    }
    if (method === 'PUT') {
      puts += 1;
      return jsonResponse({ success: true });
    }
    if (String(url).includes('prefix=')) {
      const key = decodeURIComponent(String(url).split('prefix=')[1]);
      return jsonResponse({ result: [{ key }] });
    }
    return jsonResponse({ result: [] });
  };
  const [watch] = await mirrorPosters(
    [{ title: 'Film', posterSource: 'https://a.ltrbxd.com/kept.jpg' }],
    { fetch: fetchImpl, token: 'token', accountId: 'account', warn() {} },
  );
  assert.equal(puts, 0);
  assert.notEqual(watch.poster, watch.posterFull);
  assert.match(watch.poster, /\.jpg$/);
  assert.match(watch.posterFull, /\.jpg$/);
});

test('a failed fetch or upload falls back without throwing', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  const [watch] = await mirrorPosters(
    [{ title: 'Film', posterSource: 'https://a.ltrbxd.com/x.jpg' }],
    { fetch: fetchImpl, token: 'token', accountId: 'account', warn() {} },
  );
  assert.equal(watch.poster, '');

  const uploadFails = async (url, init = {}) => {
    if (String(url).includes('a.ltrbxd.com')) return imageResponse();
    if ((init.method || 'GET') === 'PUT') return jsonResponse({}, 500);
    return jsonResponse({ result: [] });
  };
  const [second] = await mirrorPosters(
    [{ title: 'Film', posterSource: 'https://s.ltrbxd.com/y.jpg' }],
    { fetch: uploadFails, token: 'token', accountId: 'account', warn() {} },
  );
  assert.equal(second.poster, '');
});

test('missing credentials skip the network', async () => {
  let called = false;
  const [watch] = await mirrorPosters(
    [{ title: 'Film', posterSource: 'https://a.ltrbxd.com/x.jpg' }],
    { fetch: async () => { called = true; return imageResponse(); }, token: '', accountId: '', warn() {} },
  );
  assert.equal(called, false);
  assert.equal(watch.poster, '');
});

test('VISUAL_FIXTURE keeps a media-host poster and ignores everything else', async () => {
  const prev = process.env.VISUAL_FIXTURE;
  process.env.VISUAL_FIXTURE = '1';
  try {
    const watches = await mirrorPosters([
      {
        title: 'Kept',
        poster: 'https://media.mattdoes.online/posters/kept.jpg',
        posterWidth: 300,
        posterHeight: 450,
      },
      { title: 'Foreign', poster: 'https://evil.example/x.jpg', posterWidth: 10, posterHeight: 10 },
    ], { warn() {} });
    assert.equal(watches[0].poster, 'https://media.mattdoes.online/posters/kept.jpg');
    assert.equal(watches[0].posterWidth, 300);
    assert.equal(watches[0].posterFull, 'https://media.mattdoes.online/posters/kept.jpg');
    assert.equal(watches[0].posterFullWidth, 300);
    assert.equal(watches[1].poster, '');
    assert.equal(watches[1].posterFull, '');
    assert.equal(watches[1].posterWidth, 0);
  } finally {
    if (prev == null) delete process.env.VISUAL_FIXTURE;
    else process.env.VISUAL_FIXTURE = prev;
  }
});
