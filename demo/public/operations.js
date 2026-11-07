import { hasRole } from './permissions.js';
import { parseCSV, csvMoney } from './csv.js';
import {uuid} from './identifiers.js';

export const operationCollections=['cashSessions','refunds','documents','memberships','businessProfiles'];
export const operationMethods={registers:['GET','POST'],refunds:['GET','POST'],documents:['GET','POST','PATCH'],memberships:['GET','POST','PATCH'],'billing-profile':['GET','PATCH'],'stock-import':['POST']};
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max=500,required=false)=>{if(typeof value!=='string' || value.trim().length>max || required && !value.trim())fail(400,'Vérifiez les champs du formulaire.');return value.trim();};
const cents=(value,zero=true)=>{if(!Number.isSafeInteger(value) || value<(zero?0:1) || value>100000000)fail(400,'Montant invalide.');return value;};
const date=value=>{const parsed=new Date(value+'T12:00:00Z');if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0,10)!==value)fail(400,'Date invalide.');return value;};
const find=(rows,id)=>rows.find(row=>row.id===id) || fail(404,'Enregistrement introuvable.');
const requireRole=(me,...roles)=>{if(!hasRole(me,...roles))fail(403,'Vous n’avez pas accès à cet outil.');};
const stamp=me=>({created_at:new Date().toISOString(),operator_id:me.id,operator_name:me.name});
const today=state=>new Intl.DateTimeFormat('en-CA',{timeZone:state.settings?.timeZone || 'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const payments=['Espèces','Carte','Virement','Chèque','Autre'];
const siteAccess=(state,me,id)=>{const site=find(state.sites,id);if(me.cash_station && me.cash_station.site_id!==id)fail(403,'Utilisez le site du poste caisse.');return site;};
export function openRegister(state,siteId,{required=true}={}) {
  const session=state.cashSessions?.find(row=>row.site_id===siteId && row.status==='open');
  if(required && !session)fail(409,'Ouvrez la caisse du site avant d’enregistrer une vente.');return session;
}
export function registerSummary(row,state) {
  const sales=(state.sales || []).filter(sale=>sale.register_id===row.id);
  const refunds=(state.refunds || []).filter(refund=>refund.register_id===row.id);
  const cash=sales.filter(sale=>sale.payment==='Espèces').reduce((sum,sale)=>sum+sale.total_cents,0);
  const returned=refunds.filter(refund=>refund.payment==='Espèces').reduce((sum,refund)=>sum+refund.amount_cents,0);
  const movements=(row.movements || []).reduce((sum,movement)=>sum+movement.amount_cents,0);
  return {...row,expected_cents:row.opening_cents+cash-returned+movements,sales_cents:sales.reduce((sum,sale)=>sum+sale.total_cents,0),refunds_cents:refunds.reduce((sum,refund)=>sum+refund.amount_cents,0),tickets:sales.length};
}

function profileData(body) {
  return Object.fromEntries(['legal_name','address','registration','legal_form','vat_number','vat_exemption','payment_terms','late_penalties','guarantee','extra_mentions'].map(key=>[key,text(body[key]??'',key==='extra_mentions'?2000:500)]));
}
function documentData(body,state) {
  if(!['quote','invoice'].includes(body.kind))fail(400,'Choisissez un devis ou une facture.');
  const contact=find(state.contacts,body.contact_id);
  if(!Array.isArray(body.lines) || !body.lines.length || body.lines.length>50)fail(400,'Ajoutez entre 1 et 50 lignes.');
  const lines=body.lines.map(line=>{
    if(!line || typeof line!=='object')fail(400,'Ligne de document invalide.');
    const label=text(line.label,200,true),unit_ht_cents=cents(line.unit_ht_cents),quantity=line.quantity,vat_bps=line.vat_bps;
    if(!Number.isInteger(quantity) || quantity<1 || quantity>10000 || !Number.isInteger(vat_bps) || vat_bps<0 || vat_bps>2500)fail(400,'Quantité ou taux de TVA invalide.');
    const ht_cents=unit_ht_cents*quantity,tax_cents=Math.round(ht_cents*vat_bps/10000);cents(ht_cents);cents(ht_cents+tax_cents);
    return {label,quantity,unit_ht_cents,vat_bps,ht_cents,tax_cents};
  });
  const ht_cents=lines.reduce((sum,line)=>sum+line.ht_cents,0),tax_cents=lines.reduce((sum,line)=>sum+line.tax_cents,0);cents(ht_cents+tax_cents);
  if(!['goods','services','both'].includes(body.operation_type))fail(400,'Choisissez la nature de l’opération.');
  return {kind:body.kind,contact_id:contact.id,customer:{name:contact.name,address:contact.address || '',email:contact.email || '',registration:text(body.customer_registration??'',100),vat_number:text(body.customer_vat_number??'',100),professional:body.professional===true},
    delivery_address:text(body.delivery_address??'',500),purchase_order:text(body.purchase_order??'',100),operation_type:body.operation_type,
    service_date:date(body.service_date),due_date:date(body.due_date),lines,ht_cents,tax_cents,total_cents:ht_cents+tax_cents,note:text(body.note??'',1500)};
}
function nextNumber(state,kind,year) {
  const prefix={invoice:'F',quote:'D',credit:'AV'}[kind]+year+'-';
  const last=state.documents.filter(row=>row.number?.startsWith(prefix)).reduce((max,row)=>Math.max(max,Number(row.number.slice(prefix.length)) || 0),0);
  return prefix+String(last+1).padStart(6,'0');
}
export function documentSummary(row,state) {
  const paid_cents=(row.payments || []).reduce((sum,event)=>sum+(event.kind==='refund'?-event.amount_cents:event.amount_cents),0);
  const credited_cents=state.documents.filter(value=>value.kind==='credit' && value.source_id===row.id && value.status==='issued').reduce((sum,value)=>sum+value.total_cents,0);
  return {...row,paid_cents,credited_cents,balance_cents:row.total_cents-credited_cents-paid_cents};
}

export function runOperation({path,method,body={},state,me,createStock,record}) {
  const [resource,id,action]=path.split('/').filter(Boolean);
  for(const key of operationCollections)state[key]??=[];
  if(resource==='registers') {
    requireRole(me,'vente');
    if(method==='GET')return state.cashSessions.filter(row=>!me.cash_station || row.site_id===me.cash_station.site_id).map(row=>registerSummary(row,state));
    if(!id) {
      const site=siteAccess(state,me,body.site_id);
      if(openRegister(state,site.id,{required:false}))fail(409,'Une caisse est déjà ouverte pour ce site.');
      const row={id:uuid(),site_id:site.id,status:'open',opening_cents:cents(body.opening_cents),movements:[],...stamp(me)};state.cashSessions.unshift(row);return row;
    }
    const row=find(state.cashSessions,id);siteAccess(state,me,row.site_id);
    if(row.status!=='open')fail(409,'Cette caisse est déjà clôturée.');
    if(action==='movement') {
      const amount=cents(body.amount_cents,false),direction=body.direction;
      if(!['in','out'].includes(direction))fail(400,'Choisissez une entrée ou une sortie.');
      const reason=text(body.reason,500,true);
      if(direction==='out' && amount>registerSummary(row,state).expected_cents)fail(400,'La sortie dépasse les espèces attendues.');
      row.movements.push({id:uuid(),amount_cents:direction==='out'?-amount:amount,reason,...stamp(me)});return row;
    }
    if(action==='close') {
      const summary=registerSummary(row,state),counted_cents=cents(body.counted_cents),difference_cents=counted_cents-summary.expected_cents;
      const note=text(body.note??'',500,difference_cents!==0);
      Object.assign(row,{status:'closed',closed_at:new Date().toISOString(),closed_by:me.name,counted_cents,difference_cents,note,closing_expected_cents:summary.expected_cents});return registerSummary(row,state);
    }
    fail(405,'Action de caisse indisponible.');
  }
  if(resource==='refunds') {
    requireRole(me,'vente');
    if(method==='GET')return state.refunds.filter(row=>!me.cash_station || row.site_id===me.cash_station.site_id);
    if(id)fail(405,'Une correction enregistrée ne peut pas être modifiée.');
    const sale=find(state.sales,body.sale_id);siteAccess(state,me,sale.site_id);
    const session=openRegister(state,sale.site_id);
    if(state.refunds.some(row=>row.sale_id===sale.id))fail(409,'Cette vente a déjà été corrigée.');
    if(!['cancel','refund'].includes(body.kind) || body.confirm_payment!==true)fail(400,'Confirmez la correction et le remboursement effectué, le cas échéant.');
    if(body.kind==='cancel' && sale.register_id!==session.id)fail(400,'Une vente d’une caisse précédente nécessite un remboursement.');
    if(!payments.includes(body.payment))fail(400,'Choisissez le moyen de remboursement.');
    const reason=text(body.reason,500,true),return_ids=body.return_ids??[];
    if(!Array.isArray(return_ids) || new Set(return_ids).size!==return_ids.length)fail(400,'Vérifiez les objets retournés.');
    const returned=return_ids.map(id=>{
      if(!sale.lines.some(line=>line.id===id && line.kind!=='libre'))fail(400,'Objet absent de cette vente.');
      const row=find(state.stock,id);if(row.state!=='sorti' || row.exit_type!=='vente' || row.last_sale_id!==sale.id)fail(409,'Cet objet a déjà changé de situation.');return row;
    });
    if(body.payment==='Espèces' && sale.total_cents>registerSummary(session,state).expected_cents)fail(400,'Les espèces attendues ne couvrent pas le remboursement.');
    const refund={id:uuid(),sale_id:sale.id,site_id:sale.site_id,register_id:session.id,kind:body.kind,payment:body.payment,reason,amount_cents:sale.total_cents,return_ids,...stamp(me)};
    state.refunds.unshift(refund);
    for(const row of returned) {row.state='controle';row.note='Retour à vérifier · '+reason;row.web_visible=false;delete row.exit_type;record(row,me,'retour','Retour après remboursement · '+reason);}
    return refund;
  }
  if(resource==='billing-profile') {
    requireRole(me,'administration');
    if(id)fail(404,'Adresse inconnue.');
    if(method==='GET')return state.businessProfiles[0]??{id:'billing'};
    const row={id:'billing',...profileData(body),...stamp(me)};state.businessProfiles=[row];return row;
  }
  if(resource==='documents') {
    requireRole(me,'administration');
    if(method==='GET')return id?documentSummary(find(state.documents,id),state):state.documents.map(row=>documentSummary(row,state));
    if(!id) {
      if(method!=='POST')fail(405,'Action indisponible.');
      const row={id:uuid(),...documentData(body,state),status:'draft',payments:[],currency:state.settings?.currency || 'EUR',...stamp(me)};state.documents.unshift(row);return row;
    }
    const row=find(state.documents,id);
    if(method==='PATCH') {
      if(row.status!=='draft')fail(409,'Une pièce émise est figée. Utilisez un avoir.');
      Object.assign(row,documentData(body,state),{updated_at:new Date().toISOString()});return row;
    }
    if(action==='issue') {
      if(row.status!=='draft')fail(409,'Cette pièce est déjà émise ou annulée.');
      const seller=state.businessProfiles[0],issued_date=today(state);
      if(!seller?.legal_name || !seller.address || !seller.registration || !seller.payment_terms || !seller.late_penalties)fail(400,'Complétez les coordonnées et conditions de facturation.');
      if(row.lines.some(line=>line.vat_bps===0) && !seller.vat_exemption)fail(400,'Indiquez le motif de TVA à zéro dans les paramètres.');
      if(row.tax_cents && !seller.vat_number)fail(400,'Indiquez le numéro de TVA de la structure.');
      if(!row.customer.address || row.customer.professional && !row.customer.registration)fail(400,'Complétez l’adresse et, pour un professionnel, l’identification du client.');
      if(!row.customer.professional && row.operation_type!=='services' && !seller.guarantee)fail(400,'Renseignez la garantie applicable dans les paramètres de facturation.');
      if(row.due_date<issued_date)fail(400,'L’échéance ou la validité ne peut pas précéder l’émission.');
      Object.assign(row,{status:'issued',issued_date,number:nextNumber(state,row.kind,issued_date.slice(0,4)),seller:structuredClone(seller),country:state.settings?.country || 'FR',issued_by:me.name});return documentSummary(row,state);
    }
    if(action==='cancel' && row.status==='draft'){row.status='cancelled';return row;}
    if(action==='invoice' && row.kind==='quote' && row.status==='issued') {
      if(state.documents.some(value=>value.source_quote_id===row.id))fail(409,'Ce devis possède déjà une facture.');
      const invoice={...structuredClone(row),id:uuid(),kind:'invoice',status:'draft',payments:[],source_quote_id:row.id,...stamp(me)};
      delete invoice.number;delete invoice.issued_date;delete invoice.seller;delete invoice._version;state.documents.unshift(invoice);return invoice;
    }
    if(action==='credit' && row.kind==='invoice' && row.status==='issued') {
      if(state.documents.some(value=>value.source_id===row.id && value.kind==='credit'))fail(409,'Un avoir existe déjà pour cette facture.');
      const reason=text(body.reason,500,true),issued_date=today(state);
      const credit={...structuredClone(row),id:uuid(),kind:'credit',source_id:row.id,source_number:row.number,number:nextNumber(state,'credit',issued_date.slice(0,4)),issued_date,note:reason,payments:[],...stamp(me)};
      delete credit._version;state.documents.unshift(credit);return credit;
    }
    if(action==='payment' && row.kind==='invoice' && row.status==='issued') {
      const summary=documentSummary(row,state),amount_cents=cents(body.amount_cents,false),kind=body.kind==='refund'?'refund':'payment';
      if(!payments.includes(body.payment))fail(400,'Moyen de paiement invalide.');
      if(kind==='payment' && amount_cents>Math.max(0,summary.balance_cents) || kind==='refund' && amount_cents>Math.min(summary.credited_cents,summary.paid_cents))fail(400,'Le montant dépasse le solde à régler ou à rembourser.');
      const payment_date=date(body.date);if(payment_date>today(state) || payment_date<row.issued_date)fail(400,'Date de règlement incohérente.');
      row.payments.push({id:uuid(),amount_cents,kind,payment:body.payment,date:payment_date,reference:text(body.reference??'',200),...stamp(me)});return documentSummary(row,state);
    }
    fail(405,'Action indisponible pour cette pièce.');
  }
  if(resource==='memberships') {
    requireRole(me,'administration');
    if(method==='GET')return state.memberships;
    if(id){if(action!=='cancel' || method!=='POST')fail(405,'Une cotisation enregistrée ne peut pas être réécrite.');const row=find(state.memberships,id);if(row.cancelled_at)fail(409,'Cette cotisation est déjà annulée.');row.cancellation_reason=text(body.reason,500,true);row.cancelled_at=new Date().toISOString();row.cancelled_by=me.name;return row;}
    if(method!=='POST')fail(405,'Action indisponible.');
    const contact=find(state.contacts,body.contact_id),starts_on=date(body.starts_on),ends_on=date(body.ends_on),paid_on=date(body.paid_on),amount_cents=cents(body.amount_cents);
    if(ends_on<starts_on || paid_on>today(state) || !payments.includes(body.payment))fail(400,'Vérifiez les dates et le paiement.');
    if(state.memberships.some(row=>row.contact_id===contact.id && !row.cancelled_at && row.starts_on<=ends_on && row.ends_on>=starts_on))fail(409,'Une adhésion couvre déjà cette période.');
    const row={id:uuid(),contact_id:contact.id,contact_name:contact.name,starts_on,ends_on,paid_on,amount_cents,payment:body.payment,reference:text(body.reference??'',200),...stamp(me)};state.memberships.unshift(row);return row;
  }
  if(resource==='stock-import') {
    requireRole(me,'admin');siteAccess(state,me,body.site_id);
    if(id || !['preview','commit'].includes(body.mode))fail(400,'Demandez un aperçu avant d’importer.');
    let parsed;try{parsed=parseCSV(body.csv);}catch(error){fail(400,error.message);}
    const seen=new Set(state.stock.map(row=>row.import_ref).filter(Boolean)),preview=[],copy=body.mode==='commit'?state:structuredClone(state);
    for(const row of parsed) {
      const info={line:row.line,reference:row.reference_externe,title:row.titre,status:'ready'};
      try {
        if(!row.reference_externe || row.reference_externe.length>100)throw new Error('Référence externe requise (100 caractères maximum).');
        if(seen.has(row.reference_externe)){preview.push({...info,status:'duplicate'});continue;}
        const site=find(copy.sites,body.site_id),zone=row.zone?site.zones.find(zone=>zone.name.toLocaleLowerCase()===row.zone.toLocaleLowerCase()):null;
        if(row.zone && !zone)throw new Error('Zone inconnue.');
        const integer=value=>value?(/^\d+$/.test(value)?Number(value):NaN):null;
        const value=createStock({kind:row.type||'item',title:row.titre,category:row.categorie,quantity:integer(row.quantite),grams:integer(row.poids_g),price_cents:csvMoney(row.prix??''),barcode:row.code_barres??'',origin:row.provenance||'Import de stock',site_id:site.id,zone_id:zone?.id},copy,me);
        find(copy.stock,value.id).import_ref=row.reference_externe;seen.add(row.reference_externe);info.id=value.id;
      }catch(error){info.status='error';info.error=error.message;}
      preview.push(info);
    }
    if(body.mode==='commit' && preview.some(row=>row.status==='error'))fail(400,'Import annulé : corrigez toutes les lignes signalées.');
    return {rows:preview,imported:preview.filter(row=>row.status==='ready').length,duplicates:preview.filter(row=>row.status==='duplicate').length,errors:preview.filter(row=>row.status==='error').length};
  }
  fail(404,'Outil introuvable.');
}
