export const organisations = {
  passages:'Ressourcerie des Passages',
  boucle:'La Boucle Solidaire',
};

export const roleNames = {
  admin:'Responsable', reception:'Réception', tri:'Tri', atelier:'Atelier', stock:'Stock',
  vente:'Caisse', rapports:'Gestion et rapports', collecte:'Tournées', registre:'Journal des entrées', administration:'Administration',
};

export const pageRoles = {
  accueil:['reception','tri'], scanner:['reception','tri','atelier','stock','vente'],
  caisse:['vente'], stock:['reception','tri','atelier','stock'], controle:['tri','atelier','stock'],
  transferts:['reception','tri','stock'], planning:[], tournees:['collecte'], rapports:['rapports'],
  contacts:['reception','stock','administration'], reglages:['admin'], registre:['registre'], vitrine:['stock'], equipe:['admin'], sites:['admin'],
  documents:['administration'], adhesions:['administration'], imports:['admin'],
};

export const hasRole = (member, ...roles) => Boolean(member &&
  (member.roles.includes('admin') || roles.some(role => member.roles.includes(role))));
export const canOpen = (member, page) => Boolean(member && Object.hasOwn(pageRoles,page)
  && (member.cash_station ? page === 'caisse' : !pageRoles[page].length || hasRole(member,...pageRoles[page])));
export const demoPhoto = value => typeof value === 'string' && value.length < 350000
  && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value) ? value : '';
