import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run(): Promise<void> {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'commisai';

  const adminConn = await mysql.createConnection({
    host,
    port,
    user,
    password,
  });

  try {
    await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  } finally {
    await adminConn.end();
  }

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });

  try {
    const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await conn.query(schemaSql);
    console.log(`Database '${database}' is ready and schema applied.`);
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Failed to initialize schema:', err);
  process.exit(1);
});
