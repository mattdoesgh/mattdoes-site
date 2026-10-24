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
  assert.ok(watch.poster.startsWith(posterPublicUrl('posters/').slice(0, 40)));
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
    assert.equal(watches[1].poster, '');
    assert.equal(watches[1].posterWidth, 0);
  } finally {
    if (prev == null) delete process.env.VISUAL_FIXTURE;
    else process.env.VISUAL_FIXTURE = prev;
  }
});
