import Dexie, { Table } from 'dexie';

export interface OfflineAction {
  id?: number;
  offlineId: string; // idempotency key
  table: string;
  operation: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  tenantId: string;
  createdAt: number;
  retries: number;
}

export interface CachedProduct {
  id: string;
  tenant_id: string;
  sku?: string;
  name: string;
  sale_price: number;
  purchase_price: number;
  vat_rate?: number;
  track_stock: boolean;
  unit_of_measure: string;
  is_active: boolean;
  cached_at: number;
}

export interface CachedCustomer {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone?: string;
  payment_terms_days: number;
  is_active: boolean;
  cached_at: number;
}

export interface CachedStockLevel {
  product_id: string;
  warehouse_id: string;
  tenant_id: string;
  quantity: number;
  cached_at: number;
}

class LiBooksDB extends Dexie {
  offlineActions!: Table<OfflineAction, number>;
  cachedProducts!: Table<CachedProduct, string>;
  cachedCustomers!: Table<CachedCustomer, string>;
  cachedStockLevels!: Table<CachedStockLevel, [string, string]>;

  constructor() {
    super('LiBooksDB');
    this.version(1).stores({
      offlineActions: '++id, offlineId, table, operation, tenantId, createdAt',
      cachedProducts: 'id, tenant_id, sku, name, is_active',
      cachedCustomers: 'id, tenant_id, name, is_active',
      cachedStockLevels: '[product_id+warehouse_id], product_id, warehouse_id, tenant_id',
    });
  }
}

export const localDb = new LiBooksDB();

export async function queueOfflineAction(
  action: Omit<OfflineAction, 'id' | 'retries' | 'createdAt'>
): Promise<void> {
  await localDb.offlineActions.add({
    ...action,
    createdAt: Date.now(),
    retries: 0,
  });
}

export async function getPendingCount(): Promise<number> {
  return localDb.offlineActions.count();
}
