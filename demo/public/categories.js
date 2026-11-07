export const categoryIcons = {
  Livres: ['book', 'violet'],
  Textile: ['shirt', 'blue'],
  Vaisselle: ['cup', 'rose'],
  'Maison et déco': ['lamp', 'amber'],
  'Jeux et jouets': ['game', 'teal'],
  Électrique: ['plug', 'blue'],
  Mobilier: ['chair', 'amber'],
  'Sport et loisirs': ['sport', 'teal'],
  Autre: ['box', 'neutral'],
};

export const pictograms = {
  box: 'Carton', book: 'Livre', shirt: 'Vêtement', cup: 'Tasse',
  lamp: 'Lampe', game: 'Jeu', plug: 'Prise', chair: 'Chaise', sport: 'Sport', wrench: 'Outil',
};
export const colors = { neutral: 'Gris', violet: 'Violet', blue: 'Bleu', rose: 'Rose', amber: 'Ocre', teal: 'Sarcelle' };

export const acceptedCategories = (site, defaults) => site?.categories ?? defaults;
