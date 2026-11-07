export const functionalityOptions=[['untested','Non testé'],['working','Testé : fonctionne'],['not_working','Ne fonctionne pas'],['not_applicable','Sans objet']];
export function cleanVisualCondition(value) {
  if(!value||typeof value!=='object')return null;
  const grade=['like_new','good','fair','poor','unknown'].includes(value.grade)?value.grade:'unknown';
  const text=value=>typeof value==='string'?value.trim().slice(0,500):'';
  return {grade,summary:text(value.summary),defects:(Array.isArray(value.defects)?value.defects:[]).filter(value=>typeof value==='string').slice(0,6).map(value=>text(value).slice(0,160)),limits:text(value.limits),source:'photo'};
}
export function visualGrade(grade) {return {like_new:'Très bon état visuel',good:'Bon état visuel',fair:'État visuel correct',poor:'État visuel dégradé',unknown:'État visuel à vérifier'}[grade]||'État visuel à vérifier';}
