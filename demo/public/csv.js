export function parseCSV(source) {
  if(typeof source!=='string' || source.length>1000000)throw new Error('Fichier CSV de 1 Mo maximum.');
  source=source.replace(/^\uFEFF/,'');
  const first=source.split(/\r?\n/)[0];
  const separator=first.includes(';') ? ';' : ',';
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const push=()=>{row.push(cell);cell='';closed=false;};
  for(let i=0;i<source.length;i++) {
    const ch=source[i];
    if(quoted) {if(ch==='"') {if(source[i+1]==='"'){cell+='"';i++;}else {quoted=false;closed=true;}}else cell+=ch;continue;}
    if(ch==='"' && !cell && !closed){quoted=true;continue;}
    if(ch===separator){push();continue;}
    if(ch==='\n' || ch==='\r'){if(ch==='\r' && source[i+1]==='\n')i++;push();if(row.some(value=>value.trim()))rows.push(row);row=[];continue;}
    if(closed && ch.trim())throw new Error('Caractère inattendu après un champ entre guillemets.');
    if(ch==='"')throw new Error('Guillemets invalides dans le CSV.');
    if(!closed)cell+=ch;
  }
  if(quoted)throw new Error('Champ entre guillemets non terminé.');
  push();if(row.some(value=>value.trim()))rows.push(row);
  if(rows.length<2 || rows.length>201)throw new Error('Le CSV doit contenir un en-tête et entre 1 et 200 lignes.');
  const headers=rows.shift().map(value=>value.trim().toLowerCase());
  if(new Set(headers).size!==headers.length)throw new Error('Les noms de colonnes doivent être uniques.');
  if(!['reference_externe','titre','categorie'].every(name=>headers.includes(name)))throw new Error('Colonnes requises : reference_externe, titre, categorie.');
  return rows.map((values,index)=>{if(values.length!==headers.length)throw new Error('Nombre de colonnes incorrect à la ligne '+(index+2)+'.');return {line:index+2,...Object.fromEntries(headers.map((key,i)=>[key,values[i].trim()]))};});
}
export function csvMoney(value) {
  if(value==='')return null;
  if(!/^\d{1,7}([.,]\d{1,2})?$/.test(value))throw new Error('Prix invalide.');
  const [whole,decimal='']=value.replace(',','.').split('.');return Number(whole)*100+Number(decimal.padEnd(2,'0'));
}
export const stockCSVTemplate='reference_externe;titre;categorie;type;quantite;poids_g;prix;code_barres;provenance;zone\nIMPORT-001;Lot de livres;Livres;lot;12;3000;;;Apport volontaire;\n';
