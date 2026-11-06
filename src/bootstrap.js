import { categories, code, event, id, one, passwordHash } from './domain.js';

export const demoAccount = { email: 'demo@seconde-vie.test', password: 'demo-seconde-vie' };

export async function bootstrap(db, env) {
  if (await one(db, 'SELECT id FROM organisations LIMIT 1')) return;
  const demo = env.DEMO_MODE === 'true';
  const email = (demo ? demoAccount.email : env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = demo ? demoAccount.password : env.ADMIN_PASSWORD;
  if (!email.includes('@') || !password || (!demo && password.length < 12)) {
    throw new Error('Pour initialiser, définissez ADMIN_EMAIL et ADMIN_PASSWORD (12 caractères minimum), ou activez DEMO_MODE en local.');
  }
  const organisation = id();
  const admin = id();
  const hash = await passwordHash(password);
  await db.transaction(async (tx) => {
    await tx.query('LOCK TABLE organisations IN EXCLUSIVE MODE');
    if (await one(tx, 'SELECT id FROM organisations LIMIT 1')) return;
    await tx.query('INSERT INTO organisations(id,name) VALUES($1,$2)', [organisation, env.ORGANISATION_NAME || (demo ? 'Ressourcerie des Passages' : 'Ma ressourcerie')]);
    await tx.query('INSERT INTO members(id,org_id,email,name,password_hash,roles) VALUES($1,$2,$3,$4,$5,$6)',
      [admin, organisation, email, env.ADMIN_NAME || (demo ? 'Camille Martin' : 'Responsable'), hash, ['admin']]);
    const sites = demo ? [
      { name: 'Atelier des Passages', kind: 'Réception et tri', zones: ['Réception', 'Bac à vérifier', 'Atelier'] },
      { name: 'Dépôt des Peupliers', kind: 'Stockage', zones: ['Réserve A', 'Réserve B'] },
      { name: 'Boutique du Canal', kind: 'Vente', zones: ['Réserve', 'Rayon'] },
    ] : [{ name: 'Site principal', kind: 'Réception, stock et vente', zones: ['Réception', 'Atelier', 'Réserve', 'Rayon'] }];
    for (const site of sites) {
      site.id = id();
      await tx.query('INSERT INTO sites(id,org_id,name,kind) VALUES($1,$2,$3,$4)', [site.id, organisation, site.name, site.kind]);
      site.zoneIds = [];
      for (const name of site.zones) {
        const zone = id();
        site.zoneIds.push(zone);
        await tx.query('INSERT INTO zones(id,site_id,name) VALUES($1,$2,$3)', [zone, site.id, name]);
      }
    }
    if (!demo) return;
    const user = { id: admin, org_id: organisation };
    const stock = [
      ['lot', 'Carton de livres', 0, 'tri', 0, 0, 12, null, null, null],
      ['lot', 'Vaisselle et tasses', 2, 'tri', 0, 0, null, 7500, null, null],
      ['item', 'Lampe de table en céramique', 3, 'controle', 0, 1, 1, null, null, 'Vérifier le câble et le pied.'],
      ['item', 'Jeu de société — Les Aventuriers du Rail', 4, 'controle', 0, 1, 1, null, null, 'Inventorier les pièces.'],
      ['item', 'Tabouret en bois', 6, 'pret', 2, 1, 1, null, 1400, null],
      ['item', 'Vase en grès', 3, 'pret', 1, 0, 1, null, 700, null],
    ];
    for (const [kind, title, category, state, site, zone, quantity, grams, price, note] of stock) {
      const key = id();
      await tx.query(`INSERT INTO stock(id,org_id,code,kind,title,category,state,site_id,zone_id,quantity,grams,price_cents,note,origin)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Apport volontaire')`,
        [key, organisation, code(kind), kind, title, categories[category], state, sites[site].id, sites[site].zoneIds[zone], quantity, grams, price, note]);
      await event(tx, user, key, 'reception', `Entrée à ${sites[site].name}`);
    }
  });
}
