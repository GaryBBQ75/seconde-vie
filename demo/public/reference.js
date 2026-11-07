const general = [['product_type','Type d’objet'],['brand','Marque ou fabricant'],['model','Modèle ou gamme'],['manufacturer_reference','Référence fabricant'],['color','Couleur']];
const byCategory = {
  Livres: [['author','Auteur'],['translator','Traduction'],['publisher','Éditeur'],['pagination','Nombre de pages'],['edition','Édition'],['language','Langue']],
  Textile: [['size','Taille'],['material','Composition'],['pattern','Motif'],['cut','Coupe'],['fastening','Fermeture']],
  Vaisselle: [['material','Matière'],['capacity','Contenance'],['dimensions','Dimensions']],
  'Maison et déco': [['material', 'Matière'], ['dimensions', 'Dimensions']],
  'Jeux et jouets': [['age','Âge indiqué'],['players','Nombre de joueurs'],['contents','Éléments visibles']],
  Électrique: [['serial_number','Numéro de série'],['power','Puissance indiquée'],['voltage','Tension indiquée'],['material','Matière / aspect'],['accessories','Accessoires visibles']],
  Mobilier: [['material', 'Matière'], ['dimensions', 'Dimensions']],
  'Sport et loisirs': [['size', 'Taille'], ['discipline', 'Discipline']],
};

export function referenceFields(category) {
  const fields = Object.prototype.hasOwnProperty.call(byCategory, category) ? byCategory[category] : [];
  return category === 'Livres' ? fields : [...general, ...fields];
}

export function pageCountValue(value) {
  const text = String(value ?? '').trim();
  const count = /^(?:1 vol\.\s*\(\s*)?(\d+)(?:\s*(?:pages?|p\.))?\s*\)?$/i.exec(text);
  return count ? count[1] : text;
}

export function cleanReference(category, values) {
  const fields = referenceFields(category)
    .map(([key]) => {
      const value = typeof values?.[key] === 'string' ? values[key].trim().slice(0, 120) : '';
      return [key, key === 'pagination' ? pageCountValue(value) : value];
    })
    .filter(([, value]) => value);
  return fields.length ? Object.fromEntries(fields) : null;
}
