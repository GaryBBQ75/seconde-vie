import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { passwordHash, tokenHash, verifyPassword } from '../../src/domain.js';

const sessionLifetime=5*24*60*60*1000;
const cookieName='__Host-sv_session';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function openAccounts(directory) {
  const db=new DatabaseSync(resolve(directory,'accounts.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS accounts(
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secrets(name TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const getAccount=db.prepare('SELECT * FROM accounts WHERE email=?');

  function secret(name) {
    db.prepare('INSERT OR IGNORE INTO secrets VALUES(?,?)').run(name,randomBytes(32).toString('hex'));
    return db.prepare('SELECT value FROM secrets WHERE name=?').get(name).value;
  }

  async function provision(email,name,password) {
    email=email?.trim().toLowerCase();
    name=name?.trim();
    if(!email || !emailPattern.test(email) || email.length>254 || !name || name.length>100)
      throw new Error('Indiquez un e-mail et un nom de compte valides.');
    if(getAccount.get(email)) return;
    if(typeof password!=='string' || password.length<16 || password.length>250)
      throw new Error('Le mot de passe initial doit contenir de 16 à 250 caractères.');
    const hash=await passwordHash(password);
    db.prepare('INSERT OR IGNORE INTO accounts VALUES(?,?,?,?)').run(crypto.randomUUID(),email,name,hash);
  }

  const emptyHashPromise=passwordHash(randomBytes(32).toString('hex'));
  const failures=new Map();
  let verifications=0;
  const cookie=(value,maxAge)=>`${cookieName}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
  const tokenFrom=request=>request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-sv_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const sessionToken=request=>{
    const token=tokenFrom(request);
    return token && tokenHash(token);
  };

  function identity(request) {
    const token=sessionToken(request);
    return token && db.prepare(`SELECT a.id,a.email,a.name FROM sessions s JOIN accounts a
      ON a.id=s.account_id WHERE s.token=? AND s.expires_at>?`).get(token,Date.now());
  }

  async function signIn({email,password},address) {
    const now=Date.now();
    for(const [key,entry] of failures) if(entry.until<=now) failures.delete(key);
    if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>250) return {status:401};
    const key=email.trim().toLowerCase();
    const limits=[['email:'+key,12],['ip:'+address,40]];
    if(verifications>=4||limits.some(([id,limit])=>(failures.get(id)?.count||0)>=limit)||failures.size>=10000) return {status:429};
    for(const [id] of limits) {
      const entry=failures.get(id)||{count:0,until:now+900000};
      entry.count++;
      failures.set(id,entry);
    }
    const account=getAccount.get(key);
    verifications++;
    try {
      if(!await verifyPassword(password,account?.password_hash??await emptyHashPromise) || !account) return {status:401};
    } finally {verifications--;}
    failures.delete('email:'+key);
    const token=randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),account.id,now+sessionLifetime);
    return {status:200,cookie:cookie(token,sessionLifetime/1000)};
  }

  function signOut(request) {
    const token=sessionToken(request);
    if(token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return cookie('',0);
  }

  return { provision,identity,signIn,signOut,secret,close:()=>db.close() };
}
