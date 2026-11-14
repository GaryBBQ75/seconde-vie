import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { Readable } from 'node:stream';
import { publicAddress } from '../worker/commerce.mjs';

// Pin the socket to an approved public IP while verifying TLS against the shop domain.
export async function wooFetch(value,{method,headers,body,signal}) {
  const url=new URL(value);
  if(url.protocol!=='https:') throw new Error('Une boutique doit utiliser HTTPS.');
  const addresses=await lookup(url.hostname,{all:true});
  if(!addresses.length || addresses.some(({address})=>!publicAddress(address) || address.startsWith('2002:')))
    throw new Error('Adresse de boutique non publique.');
  const selected=addresses.find(({family})=>family===4)||addresses[0];
  return new Promise((resolve,reject)=>{
    const req=request(url,{
      agent:false,method,headers,signal,
      lookup(_host,options,callback) {
        if(options.all) callback(null,[selected]);
        else callback(null,selected.address,selected.family);
      },
    },response=>{
      const status=response.statusCode;
      if(status>=300 && status<400) {
        response.resume();
        reject(new Error('Redirection de la boutique refusée.'));
        return;
      }
      const content=[204,205].includes(status)?null:Readable.toWeb(response);
      if(!content) response.resume();
      resolve(new Response(content,{status}));
    });
    req.once('error',reject);
    req.end(body);
  });
}
