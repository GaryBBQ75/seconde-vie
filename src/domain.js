import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

export const id = randomUUID;
export const code = (kind) => `${kind === 'lot' ? 'LOT' : 'OBJ'}-${randomBytes(5).toString('hex').toUpperCase()}`;
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const derive = promisify(scrypt);

export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, value) {
  const [salt, key] = value.split(':');
  return timingSafeEqual(Buffer.from(key, 'hex'), await derive(password, salt, 64));
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (status, message) => { throw new HttpError(status, message); };
export const allowedRoles = ['admin', 'reception', 'tri', 'atelier', 'stock', 'vente'];
export const categories = ['Livres', 'Textile', 'Vaisselle', 'Maison et déco', 'Jeux et jouets', 'Électrique', 'Mobilier', 'Sport et loisirs', 'Autre'];

export function field(value, name, max = 180, required = true) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return null;
    fail(400, `${name} invalide.`);
  }
  const result = value.trim();
  if (!result && !required) return null;
  if (!result || result.length > max) fail(400, `${name} invalide (${max} caractères maximum).`);
  return result;
}

export function integer(value, name, min = 0, max = 100000000) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(400, `${name} invalide.`);
  }
  return value;
}

export function choice(value, list, name) {
  if (!list.includes(value)) fail(400, `${name} invalide.`);
  return value;
}

export async function one(db, sql, values = []) {
  return (await db.query(sql, values)).rows[0];
}

export async function siteAndZone(db, org, site, zone) {
  const record = await one(db, 'SELECT id FROM sites WHERE org_id=$1 AND id=$2', [org, site]);
  if (!record) fail(400, 'Ce site est introuvable.');
  if (zone && !await one(db, 'SELECT id FROM zones WHERE id=$1 AND site_id=$2', [zone, site])) {
    fail(400, 'Cette zone ne fait pas partie du site sélectionné.');
  }
}

export async function lockedStock(db, org, stockId) {
  const row = await one(db, 'SELECT * FROM stock WHERE org_id=$1 AND id=$2 FOR UPDATE', [org, stockId]);
  if (!row) fail(404, 'Cet objet ou lot est introuvable.');
  return row;
}

export async function event(db, user, stockId, type, detail) {
  await db.query('INSERT INTO stock_events(id,org_id,stock_id,member_id,type,detail) VALUES($1,$2,$3,$4,$5,$6)',
    [id(), user.org_id, stockId, user.id, type, detail]);
}
