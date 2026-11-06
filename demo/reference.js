const general = [['brand', 'Marque ou fabricant'], ['model', 'Modèle ou référence']];
const byCategory = {
  Livres: [['author', 'Auteur'], ['publisher', 'Éditeur'], ['pagination', 'Pagination']],
  Textile: [['size', 'Taille'], ['material', 'Composition']],
  Vaisselle: [['material', 'Matière'], ['capacity', 'Contenance']],
  'Maison et déco': [['material', 'Matière'], ['dimensions', 'Dimensions']],
  'Jeux et jouets': [['age', 'Âge indiqué'], ['players', 'Nombre de joueurs']],
  Électrique: [['power', 'Puissance indiquée']],
  Mobilier: [['material', 'Matière'], ['dimensions', 'Dimensions']],
  'Sport et loisirs': [['size', 'Taille'], ['discipline', 'Discipline']],
};

export function referenceFields(category) {
  const fields = Object.prototype.hasOwnProperty.call(byCategory, category) ? byCategory[category] : [];
  return category === 'Livres' ? fields : [...general, ...fields];
}

export function cleanReference(category, values) {
  const fields = referenceFields(category)
    .map(([key]) => [key, typeof values?.[key] === 'string' ? values[key].trim().slice(0, 120) : ''])
    .filter(([, value]) => value);
  return fields.length ? Object.fromEntries(fields) : null;
}
