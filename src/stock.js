import { categories, choice, code, event, fail, field, id, integer, lockedStock, one, siteAndZone } from './domain.js';

export const stockSelect = `SELECT s.*, si.name AS site_name, z.name AS zone_name,
  (p.stock_id IS NOT NULL) AS has_photo, parent.code AS parent_code
  FROM stock s JOIN sites si ON si.id=s.site_id LEFT JOIN zones z ON z.id=s.zone_id
  LEFT JOIN photos p ON p.stock_id=s.id LEFT JOIN stock parent ON parent.id=s.parent_id`;

function image(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail(400, 'Photo invalide.');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) fail(400, 'Photo JPG, PNG ou WebP attendue.');
  const data = Buffer.from(match[2], 'base64');
  if (data.length < 12 || data.length > 2_000_000) fail(400, 'La photo doit faire moins de 2 Mo.');
  const valid = (match[1] === 'image/jpeg' && data.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    || (match[1] === 'image/png' && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (match[1] === 'image/webp' && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP');
  if (!valid) fail(400, 'Le format de la photo ne correspond pas au fichier.');
  return { mime: match[1], data };
}

function assertMovable(row) {
  if (row.state === 'transit' || row.state === 'sorti') fail(409, 'Cette fiche ne peut plus être déplacée ou modifiée.');
}

export function installStock(app, db, auth, permit) {
  app.get('/api/stock', auth, async (req, res) => {
    const { rows } = await db.query(`${stockSelect} WHERE s.org_id=$1 ORDER BY s.created_at DESC`, [req.user.org_id]);
    res.json(rows);
  });

  app.get('/api/stock/scan', auth, async (req, res) => {
    const key = field(req.query.code, 'Code', 80);
    const rows = (await db.query(`${stockSelect} WHERE s.org_id=$1 AND (upper(s.code)=upper($2) OR s.barcode=$2)
      ORDER BY s.created_at DESC LIMIT 20`, [req.user.org_id, key])).rows;
    res.json(rows);
  });

  app.post('/api/stock', auth, permit('reception', 'tri'), async (req, res) => {
    const b = req.body;
    const kind = choice(b.kind, ['lot', 'item'], 'Type de fiche');
    const category = choice(b.category, categories, 'Catégorie');
    const title = field(b.title, 'Nom', 160, false) || (kind === 'lot' ? `Lot · ${category}` : category);
    const site = field(b.site_id, 'Site');
    const zone = field(b.zone_id, 'Zone', 180, false);
    const parentId = field(b.parent_id, 'Lot d’origine', 180, false);
    const grams = integer(b.grams, 'Poids en grammes', 1);
    const quantity = kind === 'item' ? 1 : integer(b.quantity, 'Quantité', 1);
    const note = field(b.note, 'Note', 1000, false);
    const barcode = field(b.barcode, 'Code fabricant', 80, false);
    const origin = field(b.origin, 'Provenance', 100, false);
    const photo = image(b.photo);
    const state = choice(b.state || 'tri', ['tri', 'controle'], 'État initial');
    if (!quantity && !grams) fail(400, 'Indiquez le poids ou la quantité du lot.');
    if (parentId && kind !== 'item') fail(400, 'Isolez un objet à la fois.');
    const created = await db.transaction(async (tx) => {
      await siteAndZone(tx, req.user.org_id, site, zone);
      let inherited = origin;
      if (parentId) {
        const parent = await lockedStock(tx, req.user.org_id, parentId);
        assertMovable(parent);
        if (parent.kind !== 'lot' || parent.site_id !== site) fail(409, 'Le lot doit être présent sur ce site.');
        if ((parent.quantity !== null && parent.quantity < 1) || (parent.grams !== null && (!grams || grams > parent.grams))) {
          fail(400, 'Le poids ou la quantité dépasse le contenu du lot. Si le lot est pesé, pesez aussi l’objet.');
        }
        const restQty = parent.quantity === null ? null : parent.quantity - 1;
        const restGrams = parent.grams === null ? null : parent.grams - grams;
        if (restQty !== null && restGrams !== null && (restQty === 0) !== (restGrams === 0)) {
          fail(400, 'Le poids et le comptage ne concordent pas pour le reste du lot.');
        }
        const empty = (restQty === null || restQty === 0) && (restGrams === null || restGrams === 0);
        await tx.query("UPDATE stock SET quantity=$1,grams=$2,state=CASE WHEN $3 THEN 'sorti' ELSE state END,exit_type=CASE WHEN $3 THEN 'reparti' ELSE exit_type END WHERE id=$4",
          [restQty, restGrams, empty, parent.id]);
        await event(tx, req.user, parent.id, 'isolation', `${title} isolé du lot`);
        inherited = parent.origin;
      }
      const key = id();
      await tx.query(`INSERT INTO stock(id,org_id,code,kind,title,category,state,site_id,zone_id,quantity,grams,parent_id,note,barcode,origin)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [key, req.user.org_id, code(kind), kind, title, category, state, site, zone, quantity, grams, parentId, note, barcode, inherited]);
      if (photo) await tx.query('INSERT INTO photos(stock_id,mime_type,content) VALUES($1,$2,$3)', [key, photo.mime, photo.data]);
      await event(tx, req.user, key, parentId ? 'isolation' : 'reception', parentId ? 'Objet isolé d’un lot' : 'Entrée enregistrée');
      return one(tx, `${stockSelect} WHERE s.id=$1`, [key]);
    });
    res.status(201).json(created);
  });

  app.get('/api/stock/:id', auth, async (req, res) => {
    const row = await one(db, `${stockSelect} WHERE s.org_id=$1 AND s.id=$2`, [req.user.org_id, req.params.id]);
    if (!row) fail(404, 'Fiche introuvable.');
    const history = (await db.query(`SELECT e.type,e.detail,e.created_at,m.name FROM stock_events e JOIN members m ON m.id=e.member_id
      WHERE e.org_id=$1 AND e.stock_id=$2 ORDER BY e.created_at DESC LIMIT 100`, [req.user.org_id, row.id])).rows;
    res.json({ ...row, history });
  });

  app.get('/api/photos/:id', auth, async (req, res) => {
    const row = await one(db, 'SELECT p.* FROM photos p JOIN stock s ON s.id=p.stock_id WHERE s.org_id=$1 AND s.id=$2', [req.user.org_id, req.params.id]);
    if (!row) fail(404, 'Photo introuvable.');
    res.type(row.mime_type).send(Buffer.from(row.content));
  });

  app.post('/api/stock/:id/action', auth, async (req, res) => {
    const b = req.body;
    const action = choice(b.action, ['block', 'ready', 'move', 'exit', 'photo'], 'Action');
    const roles = { block: ['reception','tri','atelier','stock'], ready: ['tri','atelier'], move: ['stock','tri','atelier'], exit: ['vente','stock'], photo: ['tri','reception','atelier','stock'] };
    if (!req.user.roles.includes('admin') && !roles[action].some(role => req.user.roles.includes(role))) fail(403, 'Vous n’avez pas accès à cette action.');
    await db.transaction(async (tx) => {
      const row = await lockedStock(tx, req.user.org_id, req.params.id);
      assertMovable(row);
      if (action === 'block') {
        const note = field(b.note, 'Motif du contrôle', 500);
        await tx.query("UPDATE stock SET state='controle',note=$1 WHERE id=$2", [note, row.id]);
        await event(tx, req.user, row.id, 'controle', note);
      } else if (action === 'ready') {
        const condition = field(b.condition, 'État constaté', 100, false);
        const cents = integer(b.price_cents, 'Prix');
        await tx.query("UPDATE stock SET state='pret',condition=$1,price_cents=$2 WHERE id=$3", [condition, cents ?? row.price_cents, row.id]);
        await event(tx, req.user, row.id, 'pret', condition || 'Tri terminé');
      } else if (action === 'move') {
        const zone = field(b.zone_id, 'Zone');
        await siteAndZone(tx, req.user.org_id, row.site_id, zone);
        if (row.zone_id === zone) fail(400, 'La fiche est déjà dans cette zone.');
        await tx.query('UPDATE stock SET zone_id=$1 WHERE id=$2', [zone, row.id]);
        const target = await one(tx, 'SELECT name FROM zones WHERE id=$1', [zone]);
        await event(tx, req.user, row.id, 'rangement', `Rangé · ${target.name}`);
      } else if (action === 'exit') {
        const exit = choice(b.exit_type, ['vente', 'don', 'recyclage'], 'Motif de sortie');
        if (exit === 'vente' && (!req.user.roles.includes('vente') && !req.user.roles.includes('admin'))) fail(403, 'La fonction Vente est nécessaire.');
        if (exit === 'vente' && row.state !== 'pret') fail(409, 'Validez le tri ou le contrôle avant la vente.');
        const label = { vente: 'Sortie pour vente', don: 'Donné à un partenaire ou au public', recyclage: 'Orienté vers le recyclage' }[exit];
        await tx.query("UPDATE stock SET state='sorti',exit_type=$1 WHERE id=$2", [exit, row.id]);
        await event(tx, req.user, row.id, exit, label);
      } else {
        const photo = image(b.photo);
        if (!photo) fail(400, 'Sélectionnez une photo.');
        await tx.query(`INSERT INTO photos(stock_id,mime_type,content) VALUES($1,$2,$3)
          ON CONFLICT(stock_id) DO UPDATE SET mime_type=EXCLUDED.mime_type,content=EXCLUDED.content`, [row.id, photo.mime, photo.data]);
        await event(tx, req.user, row.id, 'photo', 'Photo mise à jour');
      }
    });
    res.json({ ok: true });
  });

  app.get('/api/transfers', auth, async (req, res) => {
    const { rows } = await db.query(`SELECT t.*, o.name AS origin_name,d.name AS destination_name,
      json_agg(json_build_object('id',s.id,'code',s.code,'title',s.title,'received_at',l.received_at) ORDER BY s.title) AS lines
      FROM transfers t JOIN sites o ON o.id=t.origin_id JOIN sites d ON d.id=t.destination_id
      JOIN transfer_lines l ON l.transfer_id=t.id JOIN stock s ON s.id=l.stock_id
      WHERE t.org_id=$1 GROUP BY t.id,o.name,d.name ORDER BY t.created_at DESC`, [req.user.org_id]);
    res.json(rows);
  });

  app.post('/api/transfers', auth, permit('stock','tri'), async (req, res) => {
    const destination = field(req.body.destination_id, 'Destination');
    const stockIds = selectedIds(req.body.stock_ids);
    const transferId = id();
    await db.transaction(async (tx) => {
      await siteAndZone(tx, req.user.org_id, destination, null);
      const rows = [];
      for (const key of stockIds.sort()) rows.push(await lockedStock(tx, req.user.org_id, key));
      const origin = rows[0].site_id;
      if (origin === destination || rows.some(row => row.site_id !== origin)) fail(400, 'Les objets doivent partir du même site vers un autre site.');
      for (const row of rows) assertMovable(row);
      const target = await one(tx, 'SELECT name FROM sites WHERE id=$1', [destination]);
      await tx.query('INSERT INTO transfers(id,org_id,origin_id,destination_id) VALUES($1,$2,$3,$4)',
        [transferId, req.user.org_id, origin, destination]);
      for (const row of rows) {
        await tx.query('INSERT INTO transfer_lines(transfer_id,stock_id,prior_state) VALUES($1,$2,$3)', [transferId, row.id, row.state]);
        await tx.query("UPDATE stock SET state='transit' WHERE id=$1", [row.id]);
        await event(tx, req.user, row.id, 'transit', `Départ vers ${target.name}`);
      }
    });
    res.status(201).json({ id: transferId });
  });

  app.post('/api/transfers/:id/receive', auth, permit('stock','reception','tri'), async (req, res) => {
    const stockIds = selectedIds(req.body.stock_ids);
    const zone = field(req.body.zone_id, 'Zone d’arrivée', 180, false);
    await db.transaction(async (tx) => {
      const transfer = await one(tx, 'SELECT t.*,s.name AS name FROM transfers t JOIN sites s ON s.id=t.destination_id WHERE t.org_id=$1 AND t.id=$2 FOR UPDATE OF t', [req.user.org_id, req.params.id]);
      if (!transfer) fail(404, 'Transfert introuvable.');
      await siteAndZone(tx, req.user.org_id, transfer.destination_id, zone);
      for (const key of stockIds.sort()) {
        const line = await one(tx, 'SELECT * FROM transfer_lines WHERE transfer_id=$1 AND stock_id=$2', [transfer.id, key]);
        if (!line) fail(400, 'Un objet sélectionné ne fait pas partie du transfert.');
        if (line.received_at) continue;
        const stock = await lockedStock(tx, req.user.org_id, key);
        if (stock.state !== 'transit') fail(409, 'Cet objet n’est plus en transit.');
        await tx.query('UPDATE transfer_lines SET received_at=now() WHERE transfer_id=$1 AND stock_id=$2', [transfer.id, key]);
        await tx.query('UPDATE stock SET site_id=$1,zone_id=$2,state=$3 WHERE id=$4', [transfer.destination_id, zone, line.prior_state, key]);
        await event(tx, req.user, key, 'arrivee', `Réception à ${transfer.name}`);
      }
    });
    res.json({ ok: true });
  });
}

function selectedIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) fail(400, 'Sélectionnez de 1 à 100 fiches.');
  return [...new Set(value.map(key => field(key, 'Identifiant de fiche', 180)))];
}
