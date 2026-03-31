export const STORES = [
  'invoices',
  'payments',
  'purchases',
  'vendors',
  'quotes',
  'fr_mapping',
  'quote_override',
  'commit_data',
  'item_list'
] as const;

export type StoreName = (typeof STORES)[number];

export const DEFAULT_UPSERT_KEY: Partial<Record<StoreName, string>> = {
  quotes: 'quote_number',
};

export const GENERATED_INDEX_COLUMNS: Partial<Record<StoreName, string[]>> = {
  invoices: ['invoice_number', 'customer'],
  payments: ['invoice_number', 'document_number', 'status', 'applied_to'],
  purchases: ['customer', 'vendor', 'date'],
  vendors: ['vendor_names', 'vendor_name', 'name'],
  quotes: ['quote_number', 'account_name', 'customer', 'product_name', 'item'],
  fr_mapping: ['invoice_number', 'account_name'],
  quote_override: ['customer', 'account_name', 'items', 'item'],
  commit_data: ['customer_name', 'item'],
  item_list: ['item', 'item_category']
};
