export const moduleOptions={
 atelier:{page:'controle',action:'Ouvrir les objets à vérifier',info:'Les interventions et le temps passé se renseignent sur les fiches objets.'},
 collectes:{page:'tournees',action:'Préparer les tournées',info:'Créez vos collectes, livraisons et étapes par site.'},
 planning:{page:'planning',action:'Configurer le planning',info:'Choisissez les sites et les personnes, préparez les créneaux puis publiez la semaine.'},
 caisse:{page:'caisse',action:'Configurer les caisses',info:'Les moyens de paiement et l’ouverture des sessions se règlent sur la page Caisse.'},
 vitrine:{page:'vitrine',action:'Configurer le catalogue',info:'Choisissez les informations publiques, les photos et les produits visibles sur votre site mobile.'},
 commerce:{page:'boutiques',action:'Connecter mes boutiques',info:'Shopify et WooCommerce : fiches en brouillon et disponibilité. eBay : export préparatoire.'},
 administration:{page:'documents',action:'Renseigner les mentions',info:'Renseignez le profil de facturation, vos coordonnées et les mentions avant d’émettre un document.'},
 adhesions:{page:'adhesions',action:'Gérer les adhésions',info:'Les périodes et montants sont définis au moment d’enregistrer une adhésion.'},
};
export const defaultCatalogue={enabled:false,intro:'Des objets qui ont encore beaucoup à offrir.',contact_email:'',address:'',hours:''};
export function validateCatalogue(input,current=defaultCatalogue){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(new Error('Réglages du catalogue invalides.'),{status:400});
 const result={...defaultCatalogue,...current};if(Object.hasOwn(input,'enabled'))result.enabled=input.enabled===true;
 for(const [key,max]of Object.entries({intro:500,contact_email:254,address:500,hours:500}))if(Object.hasOwn(input,key)){if(typeof input[key]!=='string'||input[key].length>max)throw Object.assign(new Error('Vérifiez les informations du catalogue.'),{status:400});result[key]=input[key].trim();}
 if(result.contact_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contact_email))throw Object.assign(new Error('E-mail public invalide.'),{status:400});return result;
}
