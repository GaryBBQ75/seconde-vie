import { DatabaseSync } from 'node:sqlite';
import { mkdir,readFile,writeFile,stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function localBindings(directory,{memory=false}={}) {
  await mkdir(directory,{recursive:true});
  const sqlite=new DatabaseSync(memory ? ':memory:' : resolve(directory,'core.sqlite'));
  sqlite.exec('PRAGMA foreign_keys=ON');
  const exists=sqlite.prepare("SELECT name FROM sqlite_master WHERE name='sv_workspaces'").get();
  if(!exists) sqlite.exec(await readFile(new URL('../drizzle/0000_common_core.sql',import.meta.url),'utf8'));
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
  const BUCKET={async put(key,value) {const file=resolve(directory,'photos',key);await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,new Uint8Array(value));},
    async head(key) {try{return await stat(resolve(directory,'photos',key));}catch{return null;}},
    async get(key) {try{return {body:await readFile(resolve(directory,'photos',key))};}catch{return null;}},
  };
  return {DB,BUCKET,close:()=>sqlite.close()};
}
