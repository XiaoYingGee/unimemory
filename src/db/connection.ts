import { Pool } from 'pg';
import { toSql } from 'pgvector/pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function getDb() {
  return pool;
}

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('Database extensions initialized');
  } finally {
    client.release();
  }
}

export { toSql };
