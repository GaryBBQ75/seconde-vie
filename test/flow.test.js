import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { bootstrap, demoAccount } from '../src/bootstrap.js';
import { createDatabase } from '../src/db.js';

test('parcours atelier, transferts et gestion des accès', async t => {
  const env = { DEMO_MODE: 'true' };
  const db = await createDatabase({ url: process.env.TEST_DATABASE_URL });
  t.after(() => db.close());
  await bootstrap(db, env);
  const server = createApp(db, env).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api';

  async function request(path, { body, method = body ? 'POST' : 'GET', cookie, status = 200 } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
    assert.equal(response.status, status, response.ok ? path : path + ' · ' + await response.clone().text());
    return response;
  }

  async function login(credentials) {
    const response = await request('/login', { body: credentials });
    return response.headers.get('set-cookie').split(';')[0];
  }

  await request('/stock', { status: 401 });
  const cookie = await login(demoAccount);
  const sites = await (await request('/sites', { cookie })).json();
  const origin = sites.find(s => s.kind === 'Réception et tri');
  const destination = sites.find(s => s.kind === 'Stockage');
  const common = { cookie };
  const add = async body => (await request('/stock', { cookie, body: { site_id: origin.id, category: 'Livres', ...body }, status: 201 })).json();
  const record = async id => (await request('/stock/' + id, common)).json();
  const action = (id, body, status = 200) => request('/stock/' + id + '/action', { cookie, body, status });

  const lot = await add({ kind: 'lot', grams: 1000, origin: 'Collecte partenaire' });
  const book = await add({ kind: 'item', parent_id: lot.id, grams: 250, title: 'Livre test', barcode: '9782070408504' });
  assert.equal(book.origin, 'Collecte partenaire');
  assert.equal(book.parent_code, lot.code);
  assert.equal((await record(lot.id)).grams, 750);
  await request('/stock', {
    cookie, status: 400,
    body: { kind: 'item', site_id: origin.id, category: 'Livres', parent_id: lot.id, grams: 751 },
  });
  assert.equal((await record(lot.id)).grams, 750);

  await action(book.id, { action: 'block', note: 'Vérifier la reliure' });
  await action(book.id, { action: 'exit', exit_type: 'vente' }, 409);
  await action(book.id, { action: 'ready', condition: 'Bon état', price_cents: 150 });

  const fromScan = await (await request('/stock/scan?code=' + book.code, common)).json();
  assert.equal(fromScan[0].id, book.id);
  const svg = await request('/labels/' + book.id, common);
  assert.match(svg.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await svg.text(), /<svg/);

  const transfer = await (await request('/transfers', { cookie, status: 201, body: { destination_id: destination.id, stock_ids: [lot.id, book.id] } })).json();
  assert.equal((await record(book.id)).state, 'transit');
  const receive = stock_ids => request('/transfers/' + transfer.id + '/receive', { cookie, body: { stock_ids, zone_id: destination.zones[0].id } });
  await receive([book.id]);
  await receive([book.id]);
  assert.equal((await record(lot.id)).state, 'transit');
  const arrived = await record(book.id);
  assert.equal(arrived.state, 'pret');
  assert.equal(arrived.site_id, destination.id);
  assert.equal(arrived.history.filter(e => e.type === 'arrivee').length, 1);
  await receive([lot.id]);
  await action(book.id, { action: 'exit', exit_type: 'vente' });
  assert.equal((await record(book.id)).exit_type, 'vente');

  const credentials = { email: 'atelier@example.test', password: 'essai-de-connexion' };
  const { id: memberId } = await (await request('/team', {
    cookie, status: 201, body: { ...credentials, name: 'Sacha', roles: ['reception', 'atelier'] },
  })).json();
  const memberCookie = await login(credentials);
  const me = await (await request('/me', { cookie: memberCookie })).json();
  assert.deepEqual(me.roles, ['reception', 'atelier']);
  await request('/team', { cookie: memberCookie, status: 403 });
  await request('/stock/' + lot.id + '/action', { cookie: memberCookie, status: 403, body: { action: 'exit', exit_type: 'recyclage' } });

  const starts = new Date(Date.now() + 86400_000);
  const ends = new Date(+starts + 3600_000);
  const shift = { site_id: origin.id, member_id: memberId, activity: 'Atelier', starts_at: starts.toISOString(), ends_at: ends.toISOString() };
  await request('/shifts', { cookie, body: shift, status: 201 });
  await request('/shifts', { cookie, body: shift, status: 409 });
  await request('/team/' + memberId, { cookie, method: 'PATCH', body: { active: false, roles: ['reception', 'atelier'] } });
  await request('/me', { cookie: memberCookie, status: 401 });
  const csv = await (await request('/export/stock.csv', common)).text();
  assert.match(csv, /lot_origine/);
  assert(csv.includes(book.code));
});
