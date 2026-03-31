
import { StoreName } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    });
  } catch (err) {
    throw new Error(`Cannot reach backend API at ${API_BASE}. Start backend with: npm run backend:dev`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export class DatabaseService {
  async init(): Promise<void> {
    await request('/health');
  }

  async addRecords(storeName: StoreName, records: any[]): Promise<void> {
    await request(`/${storeName}/bulk-add`, {
      method: 'POST',
      body: JSON.stringify({ records }),
    });
  }

  async upsertRecords(storeName: StoreName, records: any[], keyField: string): Promise<void> {
    await request(`/${storeName}/bulk-upsert`, {
      method: 'POST',
      body: JSON.stringify({ records, keyField }),
    });
  }

  async getAllRecords(storeName: StoreName): Promise<any[]> {
    const response = await request<{ data: any[] }>(`/${storeName}?page=1&pageSize=50000&sortBy=id&sortOrder=asc`);
    return response.data;
  }

  async clearStore(storeName: StoreName): Promise<void> {
    await request(`/${storeName}`, {
      method: 'DELETE',
    });
  }

  async deleteRecord(storeName: StoreName, id: number): Promise<void> {
    await request(`/${storeName}/${id}`, {
      method: 'DELETE',
    });
  }

  async updateRecord(storeName: StoreName, record: any): Promise<void> {
    if (!record?.id) {
      throw new Error('Record id is required for update.');
    }
    const { id, ...payload } = record;
    await request(`/${storeName}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }
}

export const dbService = new DatabaseService();
