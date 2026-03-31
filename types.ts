
export interface SalesRecord {
  id: number;
  salesperson: string;
  amount: number;
  date: string;
  product?: string;
  region?: string;
  [key: string]: any;
}

export interface VendorRecord {
  id: number;
  name: string;
  code?: string;
  [key: string]: any;
}

export interface PaymentRecord {
  id: number;
  salesperson: string;
  amount: number;
  date: string;
  method?: string;
  status?: string;
  applied_to?: string;
  [key: string]: any;
}

export interface InvoiceRecord {
  id: number;
  customer: string;
  amount: number;
  date: string;
  status?: string;
  [key: string]: any;
}

export interface PurchaseRecord {
  id: number;
  item: string;
  amount: number;
  date: string;
  category?: string;
  [key: string]: any;
}

export interface QuoteRecord {
  id: number;
  quote_number: string;
  customer: string;
  date: string;
  amount: number;
  [key: string]: any;
}

export interface CommitDataRecord {
  id: number;
  customer_name: string;
  date_signed: string;
  item: string;
  commitment_period: number;
  [key: string]: any;
}

export interface ItemListRecord {
  id: number;
  item: string;
  item_category: string;
  commit_flex: string;
  commission_logic: string;
  [key: string]: any;
}

export type StoreName = 'payments' | 'invoices' | 'purchases' | 'vendors' | 'quotes' | 'fr_mapping' | 'quote_override' | 'commit_data' | 'item_list';
export type ViewStore = StoreName | 'commission_period_payments' | 'paid_invoices' | 'commission_calculation';

export interface CommissionPeriod {
  startDate: string;
  endDate: string;
}

export interface CalculationResult {
  summary: {
    totalSales: number;
    totalCommission: number;
    count: number;
  };
  details: Array<{
    salesperson: string;
    sales: number;
    commission: number;
    notes?: string;
  }>;
}

export type ViewType = 'dashboard' | 'database' | 'calculator' | 'commissions' | 'settings' | 'dedup' | 'owner_commissions';

export interface CSVData {
  headers: string[];
  rows: any[];
}
