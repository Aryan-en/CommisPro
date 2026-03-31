import { Router } from 'express';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../db.js';
import { ApiError } from '../middleware/error.js';
import { DEFAULT_UPSERT_KEY, STORES, type StoreName } from '../store-config.js';

const entityParamSchema = z.object({
  entity: z.enum(STORES),
});

const idParamSchema = z.object({
  entity: z.enum(STORES),
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  q: z.string().trim().optional(),
  sortBy: z.enum(['id', 'created_at', 'updated_at']).default('id'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const recordSchema = z.record(z.any());

const bulkSchema = z.object({
  records: z.array(recordSchema),
});

const upsertSchema = z.object({
  records: z.array(recordSchema),
  keyField: z.string().min(1).optional(),
});

function quoteIdent(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

function toStore(rawEntity: string): StoreName {
  const parsed = entityParamSchema.safeParse({ entity: rawEntity });
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid store name', parsed.error.flatten());
  }
  return parsed.data.entity;
}

function normalizeRecord(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'id' || k === 'created_at' || k === 'updated_at') continue;
    output[k] = v;
  }
  return output;
}

function rowToRecord(row: any): Record<string, unknown> {
  return {
    id: row.id,
    ...(typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findByField(connection: PoolConnection, store: StoreName, keyField: string, keyValue: string): Promise<number | null> {
  const table = quoteIdent(store);
  const [rows] = await connection.query(
    `SELECT id FROM ${table} WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(raw_data, ?))) = ? LIMIT 1`,
    [`$.${keyField}`, keyValue.toLowerCase().trim()]
  );
  const row = (rows as any[])[0];
  return row ? Number(row.id) : null;
}

async function insertOne(connection: PoolConnection, store: StoreName, record: Record<string, unknown>): Promise<void> {
  const table = quoteIdent(store);
  await connection.query(`INSERT INTO ${table} (raw_data) VALUES (?)`, [JSON.stringify(record)]);
}

async function updateOne(connection: PoolConnection, store: StoreName, id: number, record: Record<string, unknown>): Promise<void> {
  const table = quoteIdent(store);
  await connection.query(`UPDATE ${table} SET raw_data = ? WHERE id = ?`, [JSON.stringify(record), id]);
}

export function buildEntityRouter(): Router {
  const router = Router();

  router.get('/:entity', async (req, res, next) => {
    try {
      const store = toStore(req.params.entity);
      const q = listQuerySchema.parse(req.query);
      const table = quoteIdent(store);
      const where = q.q ? 'WHERE JSON_UNQUOTE(raw_data) LIKE ?' : '';
      const whereValues = q.q ? [`%${q.q}%`] : [];
      const offset = (q.page - 1) * q.pageSize;

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM ${table} ${where}`,
        whereValues
      );
      const total = Number((countRows as any[])[0].total || 0);

      const [rows] = await pool.query(
        `SELECT id, raw_data, created_at, updated_at FROM ${table} ${where} ORDER BY ${q.sortBy} ${q.sortOrder.toUpperCase()} LIMIT ? OFFSET ?`,
        [...whereValues, q.pageSize, offset]
      );

      res.json({
        data: (rows as any[]).map(rowToRecord),
        pagination: {
          page: q.page,
          pageSize: q.pageSize,
          total,
          totalPages: Math.ceil(total / q.pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:entity/:id', async (req, res, next) => {
    try {
      const p = idParamSchema.parse(req.params);
      const table = quoteIdent(p.entity);
      const [rows] = await pool.query(
        `SELECT id, raw_data, created_at, updated_at FROM ${table} WHERE id = ? LIMIT 1`,
        [p.id]
      );
      const row = (rows as any[])[0];
      if (!row) throw new ApiError(404, 'Record not found');
      res.json({ data: rowToRecord(row) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:entity', async (req, res, next) => {
    try {
      const store = toStore(req.params.entity);
      const record = normalizeRecord(recordSchema.parse(req.body));
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await insertOne(conn, store, record);
        const [rows] = await conn.query('SELECT LAST_INSERT_ID() AS id');
        const insertedId = Number((rows as any[])[0].id);
        await conn.commit();
        res.status(201).json({ data: { id: insertedId, ...record } });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (err) {
      next(err);
    }
  });

  router.put('/:entity/:id', async (req, res, next) => {
    try {
      const p = idParamSchema.parse(req.params);
      const record = normalizeRecord(recordSchema.parse(req.body));
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await updateOne(conn, p.entity, p.id, record);
        await conn.commit();
        res.json({ data: { id: p.id, ...record } });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:entity/:id', async (req, res, next) => {
    try {
      const p = idParamSchema.parse(req.params);
      const table = quoteIdent(p.entity);
      await pool.query(`DELETE FROM ${table} WHERE id = ?`, [p.id]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:entity', async (req, res, next) => {
    try {
      const store = toStore(req.params.entity);
      const table = quoteIdent(store);
      await pool.query(`DELETE FROM ${table}`);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post('/:entity/bulk-add', async (req, res, next) => {
    try {
      const store = toStore(req.params.entity);
      const payload = bulkSchema.parse(req.body);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const input of payload.records) {
          await insertOne(conn, store, normalizeRecord(input));
        }
        await conn.commit();
        res.status(201).json({ inserted: payload.records.length });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (err) {
      next(err);
    }
  });

  router.post('/:entity/bulk-upsert', async (req, res, next) => {
    try {
      const store = toStore(req.params.entity);
      const payload = upsertSchema.parse(req.body);
      const keyField = payload.keyField || DEFAULT_UPSERT_KEY[store];
      if (!keyField) {
        throw new ApiError(400, 'keyField is required for this store');
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        let inserted = 0;
        let updated = 0;

        for (const input of payload.records) {
          const record = normalizeRecord(input);
          const keyValue = String(record[keyField] ?? '').trim();
          if (!keyValue) {
            continue;
          }

          const existingId = await findByField(conn, store, keyField, keyValue);
          if (existingId) {
            await updateOne(conn, store, existingId, record);
            updated += 1;
          } else {
            await insertOne(conn, store, record);
            inserted += 1;
          }
        }

        await conn.commit();
        res.status(200).json({ inserted, updated });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
