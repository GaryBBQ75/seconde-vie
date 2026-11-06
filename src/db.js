import { mkdir, readFile } from 'node:fs/promises';
import pg from 'pg';

export async function createDatabase({ url, directory }) {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    await pool.query(schema);
    return {
      query: (sql, args) => pool.query(sql, args),
      transaction: async (fn) => {
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          const result = await fn(connection);
          await connection.query('COMMIT');
          return result;
        } catch (error) {
          await connection.query('ROLLBACK');
          throw error;
        } finally {
          connection.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  if (directory && !directory.includes('://')) await mkdir(directory, { recursive: true });
  const local = await PGlite.create(directory);
  await local.exec(schema);
  return {
    query: (sql, args) => local.query(sql, args),
    transaction: (fn) => local.transaction(fn),
    close: () => local.close(),
  };
}
