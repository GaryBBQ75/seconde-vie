import { openAccounts } from './auth.mjs';

const [email,name]=process.argv.slice(2);
const chunks=[];
let size=0;
for await(const chunk of process.stdin) {
  size+=chunk.length;
  if(size>1024) throw new Error('Mot de passe trop long.');
  chunks.push(chunk);
}
const password=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');
const accounts=openAccounts(process.env.DATA_DIR||'/data');
try {await accounts.provision(email,name,password);}
finally {accounts.close();}
