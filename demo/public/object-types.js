// ImageNet labels for common intake items. Unmapped predictions stay unidentified.
const types = [
  ['Chaise', 'Mobilier', ['folding chair', 'rocking chair', 'barber chair'], ['chaise']],
  ['Canapé', 'Mobilier', ['studio couch'], ['canape', 'sofa']],
  ['Table', 'Mobilier', ['dining table', 'pool table'], ['table']],
  ['Bibliothèque', 'Mobilier', ['bookcase'], ['bibliotheque', 'etagere']],
  ['Armoire', 'Mobilier', ['wardrobe', 'china cabinet'], ['armoire']],
  ['Commode', 'Mobilier', ['chest'], ['commode']],
  ['Lampe', 'Maison et déco', ['table lamp', 'lampshade'], ['lampe', 'luminaire']],
  ['Vase', 'Maison et déco', ['vase'], ['vase']],
  ['Horloge', 'Maison et déco', ['wall clock', 'analog clock'], ['horloge', 'pendule']],
  ['Tasse', 'Vaisselle', ['coffee mug', 'cup'], ['tasse', 'mug']],
  ['Bol', 'Vaisselle', ['soup bowl', 'mixing bowl'], ['bol']],
  ['Théière', 'Vaisselle', ['teapot'], ['theiere']],
  ['Casserole', 'Vaisselle', ['dutch oven', 'wok', 'frying pan'], ['casserole', 'poele', 'marmite', 'wok']],
  ['Livre', 'Livres', ['book jacket', 'comic book'], ['livre', 'roman', 'bande dessinee']],
  ['Chaussures', 'Textile', ['running shoe', 'Loafer', 'sandal', 'clog', 'cowboy boot'], ['chaussure', 'basket', 'botte']],
  ['Veste', 'Textile', ['suit', 'trench coat', 'lab coat', 'fur coat'], ['veste', 'manteau']],
  ['Sac', 'Textile', ['backpack', 'purse', 'mailbag'], ['sac', 'sacoche']],
  ['Pull', 'Textile', ['cardigan', 'sweatshirt'], ['pull', 'sweat', 'gilet']],
  ['Peluche', 'Jeux et jouets', ['teddy'], ['peluche', 'doudou']],
  ['Manette', 'Jeux et jouets', ['joystick'], ['manette', 'joystick']],
  ['Aspirateur', 'Électrique', ['vacuum'], ['aspirateur']],
  ['Cafetière', 'Électrique', ['espresso maker', 'coffeepot'], ['cafetière', 'machine a cafe']],
  ['Micro-ondes', 'Électrique', ['microwave'], ['micro-ondes']],
  ['Grille-pain', 'Électrique', ['toaster'], ['grille-pain']],
  ['Ventilateur', 'Électrique', ['electric fan'], ['ventilateur']],
  ['Écran', 'Électrique', ['monitor', 'television', 'screen'], ['ecran', 'televiseur', 'television']],
  ['Fer à repasser', 'Électrique', ['iron'], ['fer a repasser']],
  ['Vélo', 'Sport et loisirs', ['mountain bike', 'bicycle-built-for-two'], ['velo', 'bicyclette', 'vtt']],
  ['Ballon', 'Sport et loisirs', ['soccer ball', 'basketball', 'volleyball', 'rugby ball'], ['ballon']],
  ['Raquette', 'Sport et loisirs', ['racket'], ['raquette']],
  ['Guitare', 'Sport et loisirs', ['acoustic guitar', 'electric guitar'], ['guitare']],
].map(([name, category, labels, words]) => ({ name, category, labels, words }));

export const normalizedWords = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function imageObjectType(label) {
  const key = normalizedWords(label.split(',')[0]);
  return types.find(type => type.labels.some(name => normalizedWords(name) === key));
}

export function matchesObjectType(row, type) {
  if (row.kind !== 'item' || row.category !== type.category) return false;
  const title = ' ' + normalizedWords(row.title) + ' ';
  return type.words.some(word => {
    const key = normalizedWords(word);
    return title.includes(' ' + key + ' ') || title.includes(' ' + key + 's ');
  });
}

export function namedObjectType(row) {
  return types.find(type => matchesObjectType(row, type));
}
