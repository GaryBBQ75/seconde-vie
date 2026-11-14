import { DatabaseSync } from 'node:sqlite';
import { mkdir,readFile,writeFile,rename,rm,stat } from 'node:fs/promises';
import { dirname,resolve,sep } from 'node:path';

export function fileBucket(directory) {
  const root=resolve(directory);
  const pathFor=key=>{
    const path=resolve(root,key);
    if(!path.startsWith(root+sep)) throw new Error('Chemin de stockage invalide.');
    return path;
  };
  const readIfPresent=async operation=>{
    try {return await operation();}
    catch(error) {if(error.code==='ENOENT') return null;throw error;}
  };
  return {
    async put(key,value) {
      const file=pathFor(key),temporary=file+'.'+crypto.randomUUID()+'.tmp';
      await mkdir(dirname(file),{recursive:true});
      try {
        await writeFile(temporary,typeof value==='string' ? value : new Uint8Array(value),{flag:'wx',mode:0o600});
        await rename(temporary,file);
      } finally {await rm(temporary,{force:true});}
    },
    head:key=>readIfPresent(()=>stat(pathFor(key))),
    async get(key) {
      const body=await readIfPresent(()=>readFile(pathFor(key)));
      return body && {body,text:async()=>body.toString('utf8')};
    },
  };
}

export async function localBindings(directory,{memory=false}={}) {
  await mkdir(directory,{recursive:true});
  const sqlite=new DatabaseSync(memory ? ':memory:' : resolve(directory,'core.sqlite'));
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  const schema=await readFile(new URL('../drizzle/0000_common_core.sql',import.meta.url),'utf8');
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE name='sv_workspaces'").get()) sqlite.exec(schema);
    sqlite.exec('COMMIT');
  } catch(error) {sqlite.exec('ROLLBACK');sqlite.close();throw error;}
  class Statement {
    constructor(sql,values=[]) {this.sql=sql;this.values=values;}
    bind(...values) {return new Statement(this.sql,values);}
    async first() {return sqlite.prepare(this.sql).get(...this.values) ?? null;}
    async all() {return {results:sqlite.prepare(this.sql).all(...this.values)};}
    execute() {
      const statement=sqlite.prepare(this.sql);
      if(statement.columns().length) return {results:statement.all(...this.values),meta:{changes:0}};
      const value=statement.run(...this.values);return {results:[],meta:{changes:Number(value.changes)}};
    }
    async run() {return this.execute();}
  }
  const DB={prepare:sql=>new Statement(sql),async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {const results=statements.map(statement=>statement.execute());sqlite.exec('COMMIT');return results;}
    catch(error) {sqlite.exec('ROLLBACK');throw error;}
  }};
  return {DB,BUCKET:fileBucket(resolve(directory,'photos')),close:()=>sqlite.close()};
}
