export function createDemoProfiles(storage) {
function demoCredential(key, pin = false) {
  const storageKey = 'seconde-vie-demo-credential-' + key;
  const saved = storage?.getItem(storageKey);
  if (saved) return saved;
  const random = crypto.getRandomValues(new Uint32Array(4));
  const value = pin ? String(100000 + random[0] % 900000)
    : Array.from(random, part => part.toString(16).padStart(8,'0')).join('');
  storage?.setItem(storageKey,value);
  return value;
}
const demoPassword = demoCredential('responsable');
const demoMembers = {
  passages:[
    {id:'passages-lea',name:'Léa Bernard',roles:['reception']},
    {id:'passages-sami',name:'Sami Diallo',roles:['tri','atelier','stock']},
    {id:'passages-ines',name:'Inès Laurent',roles:['vente']},
    {id:'passages-thomas',name:'Thomas Garnier',roles:['vente']},
    {id:'passages-noe',name:'Noé Petit',roles:['rapports']},
    {id:'passages-maya',name:'Maya Roy',roles:['collecte']},
  ],
  boucle:[
    {id:'boucle-julie',name:'Julie Moreau',roles:['reception','stock']},
    {id:'boucle-yanis',name:'Yanis Vidal',roles:['vente']},
  ],
};

for (const members of Object.values(demoMembers)) {
  for (const member of members) member.pin = demoCredential(member.id,true);
}

const demoAdminEmail = {passages:'demo@seconde-vie.test',boucle:'admin@laboucle.test'};

return {demoPassword,demoMembers,demoAdminEmail};
}
