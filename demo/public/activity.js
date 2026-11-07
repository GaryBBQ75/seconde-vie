export const workshopTypes = ['Diagnostic', 'Nettoyage', 'Réparation', 'Remise en état', 'Transformation'];
export const flowLabels = {
  reception:'Entrée', transit:'Départ en transfert', arrivee:'Arrivée de transfert',
  vente:'Vente', don:'Don', recyclage:'Recyclage', decheterie:'Déchèterie',
  atelier:'Intervention atelier',
};

export function activityEvents(stock) {
  return stock.flatMap(row => {
    const history = row.history ?? [];
    const moved = history.some(event => event.type === 'arrivee');
    const split = history.some(event => event.type === 'isolation');
    return history.filter(event => Object.hasOwn(flowLabels, event.type)).map(event => ({
      code:row.code, title:row.title, category:row.category, origin:row.origin,
      site_id:moved || ['transit','arrivee'].includes(event.type) ? null : row.site_id,
      quantity:split ? null : row.quantity,
      grams:split ? null : row.grams,
      ...event.snapshot,
      type:event.type, created_at:event.created_at, detail:event.detail,
      minutes:event.minutes ?? null,
    }));
  }).sort((a,b) => b.created_at.localeCompare(a.created_at));
}
