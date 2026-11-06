import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import QRCode from 'qrcode';
import { allowedRoles, categories, choice, fail, field, HttpError, id, one, passwordHash, tokenHash, verifyPassword } from './domain.js';
import { installStock } from './stock.js';

const sessionDays = 5;
const activities = ['Réception', 'Tri', 'Atelier', 'Stock', 'Caisse', 'Collecte'];
const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
const vendorDirectory = fileURLToPath(new URL('../node_modules/@zxing/browser/umd', import.meta.url));
const fontsDirectory = fileURLToPath(new URL('../node_modules/@fontsource-variable/inter/files', import.meta.url));
const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });

export function createApp(db, env) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const origin = req.get('Origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('Sec-Fetch-Site') === 'cross-site'
      || (origin && !sameHost(origin, req.get('Host'))))) return next(new HttpError(403, 'Requête extérieure refusée.'));
    next();
  });
  app.use(express.json({ limit: '3mb' }));
  app.use('/api', (req, res, next) => {
    req.body ??= {};
    next();
  });

  const auth = async (req, res, next) => {
    const token = req.get('Cookie')?.match(/(?:^|;\s*)sv_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!token) fail(401, 'Connectez-vous pour continuer.');
    req.sessionHash = tokenHash(token);
    req.user = await one(db, `SELECT m.id,m.org_id,m.name,m.email,m.roles,o.name AS org_name
      FROM sessions s JOIN members m ON m.id=s.member_id JOIN organisations o ON o.id=m.org_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND m.active`, [req.sessionHash]);
    if (!req.user) fail(401, 'Votre session a expiré.');
    next();
  };
  const permit = (...roles) => (req, res, next) => {
    if (!req.user.roles.includes('admin') && !roles.some(role => req.user.roles.includes(role))) fail(403, 'Vous n’avez pas accès à cette action.');
    next();
  };
  const cookie = { httpOnly: true, sameSite: 'lax', secure: env.SECURE_COOKIES === 'true', path: '/' };
  const attempts = new Map();

  app.get('/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.get('/api/config', (req, res) => res.json({ demo: env.DEMO_MODE === 'true', categories, activities }));
  app.post('/api/login', async (req, res) => {
    const email = field(req.body.email, 'E-mail', 254).toLowerCase();
    const password = field(req.body.password, 'Mot de passe', 250);
    const now = Date.now();
    for (const [address, entry] of attempts) if (entry.until <= now) attempts.delete(address);
    const key = email;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
    if (entry.count >= 12) fail(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
    entry.count += 1;
    if (attempts.size < 10000 || attempts.has(key)) attempts.set(key, entry);
    const row = await one(db, 'SELECT * FROM members WHERE email=$1 AND active', [email]);
    if (!row || !await verifyPassword(password, row.password_hash)) fail(401, 'E-mail ou mot de passe incorrect.');
    attempts.delete(key);
    const token = randomBytes(32).toString('hex');
    await db.transaction(async tx => {
      await tx.query('DELETE FROM sessions WHERE expires_at<=now()');
      await tx.query('INSERT INTO sessions(token_hash,member_id,expires_at) VALUES($1,$2,$3)',
        [tokenHash(token), row.id, new Date(now + sessionDays * 86400_000).toISOString()]);
    });
    res.cookie('sv_session', token, { ...cookie, maxAge: sessionDays * 86400_000 }).json({ ok: true });
  });
  app.post('/api/logout', auth, async (req, res) => {
    await db.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionHash]);
    res.clearCookie('sv_session', cookie).json({ ok: true });
  });
  app.get('/api/me', auth, (req, res) => res.json(req.user));

  app.get('/api/sites', auth, async (req, res) => {
    const sites = (await db.query(`SELECT s.*,COALESCE(json_agg(json_build_object('id',z.id,'name',z.name) ORDER BY z.name)
       FILTER (WHERE z.id IS NOT NULL),'[]') AS zones FROM sites s LEFT JOIN zones z ON z.site_id=s.id
       WHERE s.org_id=$1 GROUP BY s.id ORDER BY s.name`, [req.user.org_id])).rows;
    res.json(sites);
  });
  app.post('/api/sites', auth, permit('admin'), async (req, res) => {
    const name = field(req.body.name, 'Nom du site', 100);
    const kind = field(req.body.kind, 'Activités', 120);
    const zones = [...new Set(field(req.body.zones, 'Zones', 600, false)?.split(',').map(v => v.trim()).filter(Boolean) || [])];
    if (zones.some(zone => zone.length > 80) || zones.length > 30) fail(400, 'Limitez-vous à 30 noms de zone de 80 caractères.');
    const key = id();
    await db.transaction(async tx => {
      await tx.query('INSERT INTO sites(id,org_id,name,kind) VALUES($1,$2,$3,$4)', [key, req.user.org_id, name, kind]);
      for (const zone of zones) await tx.query('INSERT INTO zones(id,site_id,name) VALUES($1,$2,$3)', [id(), key, zone]);
    });
    res.status(201).json({ id: key });
  });
  app.get('/api/team', auth, permit('admin'), async (req, res) => {
    res.json((await db.query('SELECT id,name,email,roles,active FROM members WHERE org_id=$1 ORDER BY name', [req.user.org_id])).rows);
  });
  app.post('/api/team', auth, permit('admin'), async (req, res) => {
    const name = field(req.body.name, 'Nom', 100);
    const email = field(req.body.email, 'E-mail', 254).toLowerCase();
    const pass = field(req.body.password, 'Mot de passe initial', 250);
    const roles = memberRoles(req.body.roles);
    if (!/^\S+@\S+\.\S+$/.test(email) || pass.length < 12) fail(400, 'Saisissez un e-mail valide et un mot de passe de 12 caractères minimum.');
    const key = id();
    await db.query('INSERT INTO members(id,org_id,email,name,password_hash,roles) VALUES($1,$2,$3,$4,$5,$6)',
      [key, req.user.org_id, email, name, await passwordHash(pass), roles]);
    res.status(201).json({ id: key });
  });
  app.patch('/api/team/:id', auth, permit('admin'), async (req, res) => {
    const roles = memberRoles(req.body.roles);
    const active = req.body.active !== false;
    if (req.params.id === req.user.id && (!active || !roles.includes('admin'))) fail(400, 'Conservez votre accès administrateur.');
    await db.transaction(async tx => {
      const changed = await one(tx, 'UPDATE members SET roles=$1,active=$2 WHERE org_id=$3 AND id=$4 RETURNING id',
        [roles, active, req.user.org_id, req.params.id]);
      if (!changed) fail(404, 'Membre introuvable.');
      if (!active) await tx.query('DELETE FROM sessions WHERE member_id=$1', [changed.id]);
    });
    res.json({ ok: true });
  });
  app.get('/api/shifts', auth, async (req, res) => {
    const { rows } = await db.query(`SELECT sh.*,m.name AS member_name,s.name AS site_name FROM shifts sh
      JOIN members m ON m.id=sh.member_id JOIN sites s ON s.id=sh.site_id
      WHERE sh.org_id=$1 AND sh.ends_at>now()-interval '30 days' ORDER BY sh.starts_at LIMIT 300`, [req.user.org_id]);
    res.json(rows);
  });
  app.post('/api/shifts', auth, permit('admin'), async (req, res) => {
    const member = field(req.body.member_id, 'Membre');
    const site = field(req.body.site_id, 'Site');
    const activity = choice(req.body.activity, activities, 'Activité');
    const start = new Date(field(req.body.starts_at, 'Début'));
    const end = new Date(field(req.body.ends_at, 'Fin'));
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) fail(400, 'Choisissez un créneau valide.');
    const key = id();
    await db.transaction(async tx => {
      if (!await one(tx, 'SELECT id FROM members WHERE id=$1 AND org_id=$2 AND active FOR UPDATE', [member, req.user.org_id])
          || !await one(tx, 'SELECT id FROM sites WHERE id=$1 AND org_id=$2', [site, req.user.org_id])) fail(400, 'Le membre ou le site est introuvable.');
      if (await one(tx, 'SELECT id FROM shifts WHERE member_id=$1 AND starts_at<$2 AND ends_at>$3', [member, end.toISOString(), start.toISOString()])) {
        fail(409, 'Cette personne est déjà prévue sur un créneau qui se chevauche.');
      }
      await tx.query('INSERT INTO shifts(id,org_id,member_id,site_id,activity,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [key, req.user.org_id, member, site, activity, start.toISOString(), end.toISOString()]);
    });
    res.status(201).json({ id: key });
  });
  app.delete('/api/shifts/:id', auth, permit('admin'), async (req, res) => {
    if (!await one(db, 'DELETE FROM shifts WHERE org_id=$1 AND id=$2 RETURNING id', [req.user.org_id, req.params.id])) fail(404, 'Créneau introuvable.');
    res.json({ ok: true });
  });
  app.get('/api/export/stock.csv', auth, permit('admin'), async (req, res) => {
    const { rows } = await db.query(`SELECT x.code,x.title,x.category,x.kind,x.state,s.name AS site,z.name AS zone,x.quantity,x.grams,x.price_cents,x.barcode,p.code AS lot_origine
      FROM stock x JOIN sites s ON s.id=x.site_id LEFT JOIN zones z ON z.id=x.zone_id LEFT JOIN stock p ON p.id=x.parent_id
      WHERE x.org_id=$1 ORDER BY x.created_at`, [req.user.org_id]);
    const columns = ['code','title','category','kind','state','site','zone','quantity','grams','price_cents','barcode','lot_origine'];
    const lines = [columns.join(';'), ...rows.map(row => columns.map(c => csv(row[c])).join(';'))];
    res.type('text/csv').attachment('stock-seconde-vie.csv').send('\uFEFF' + lines.join('\r\n'));
  });
  app.get('/api/labels/:id', auth, async (req, res) => {
    const row = await one(db, 'SELECT code FROM stock WHERE id=$1 AND org_id=$2', [req.params.id, req.user.org_id]);
    if (!row) fail(404, 'Étiquette introuvable.');
    res.type('image/svg+xml').send(await QRCode.toString(row.code, { type: 'svg', margin: 4 }));
  });
  app.get('/api/catalog/isbn/:isbn', auth, async (req, res) => {
    const isbn = req.params.isbn.replaceAll('-', '').toUpperCase();
    if (!/^(\d{9}[\dX]|97[89]\d{10})$/.test(isbn)) fail(400, 'Ce code ne ressemble pas à un ISBN.');
    try {
      const url = new URL('https://catalogue.bnf.fr/api/SRU');
      for (const [key, value] of Object.entries({ version: '1.2', operation: 'searchRetrieve', query: `bib.isbn any "${isbn}"`, maximumRecords: '1', recordSchema: 'dublincore' })) url.searchParams.set(key, value);
      const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw new Error('Catalogue indisponible');
      const result = xml.parse(await response.text()).searchRetrieveResponse?.records?.record?.recordData;
      const record = result?.dc;
      const title = scalar(record?.title);
      res.json({ found: Boolean(title), title, author: scalar(record?.creator) });
    } catch {
      res.status(503).json({ error: 'Catalogue BnF indisponible. Vous pouvez continuer la saisie.' });
    }
  });
  installStock(app, db, auth, permit);

  app.use('/vendor/zxing', express.static(vendorDirectory));
  app.use('/vendor/fonts', express.static(fontsDirectory, { maxAge: '7d' }));
  app.use(express.static(publicDirectory, { index: 'index.html' }));
  app.use((req, res) => res.status(404).json({ error: 'Page introuvable.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'Cette entrée existe déjà.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Le fichier est trop volumineux.' });
    if (error.status === 400) return res.status(400).json({ error: 'Données de la requête invalides.' });
    console.error(error);
    res.status(500).json({ error: 'Une erreur est survenue. Réessayez dans un instant.' });
  });
  return app;
}

function sameHost(value, host) {
  try { return new URL(value).host === host; } catch { return false; }
}

function memberRoles(value) {
  if (!Array.isArray(value) || !value.length) fail(400, 'Sélectionnez au moins une fonction.');
  return [...new Set(value.map(v => choice(v, allowedRoles, 'Fonction')))];
}

function scalar(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : first?.['#text'] || null;
}

function csv(value) {
  let string = value == null ? '' : String(value);
  if (/^[=+\-@\t\r\n]/.test(string)) string = "'" + string;
  return '"' + string.replaceAll('"', '""') + '"';
}
