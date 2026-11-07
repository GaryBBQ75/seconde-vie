import { canOpen } from './permissions.js';

// One catalogue for the settings, navigation and server checks.
// Reception, sorting, stock, traceability and flow reports are always in the core.
export const modules = {
  atelier:{label:'Atelier de réparation',description:'Noter les interventions et le temps passé sur les mêmes fiches objets.',pages:[]},
  collectes:{label:'Collectes et livraisons',description:'Préparer les tournées, leurs étapes et leur suivi.',pages:['tournees']},
  planning:{label:'Planning de l’équipe',description:'Organiser les créneaux des salariés et bénévoles.',pages:['planning']},
  caisse:{label:'Caisse interne',description:'Enregistrer les ventes et tickets. Les terminaux de paiement et obligations de caisse restent à valider.',pages:['caisse']},
  vitrine:{label:'Sélection pour la vitrine',description:'Préparer une sélection interne des objets prêts à vendre. Aucune publication sur une boutique en ligne.',pages:['vitrine']},
  administration:{label:'Devis et factures',description:'Préparer les documents, figer leur émission, enregistrer les règlements et les avoirs.',pages:['documents']},
  adhesions:{label:'Adhésions et cotisations',description:'Suivre les périodes d’adhésion, renouvellements et cotisations reçues.',pages:['adhesions']},
};

export const moduleForPage = Object.fromEntries(Object.entries(modules).flatMap(([key,value])=>value.pages.map(page=>[page,key])));
export function firstAvailablePage(member,config,{demo=false}={}) {
  return ['accueil','caisse','stock','rapports','documents','adhesions','tournees','registre','planning','scanner','controle','transferts','contacts','imports','vitrine','equipe','sites','reglages']
    .find(page=>canOpen(member,page) && (demo || !moduleForPage[page] || config?.modules?.includes(moduleForPage[page]))) || null;
}
export function requiredModule(path,method='GET',body) {
  const resource=path.split('/')[1];
  if(['sales','cashiers','registers','refunds'].includes(resource))return 'caisse';
  if(['documents','billing-profile'].includes(resource))return 'administration';
  if(resource==='memberships')return 'adhesions';
  if(resource==='shifts')return 'planning';
  if(resource==='tours')return 'collectes';
  if(resource==='storefront')return 'vitrine';
  if(resource==='stock' && method!=='GET')return {workshop:'atelier',storefront:'vitrine','cash-price':'caisse'}[body?.action];
}
