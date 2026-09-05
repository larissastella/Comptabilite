export type PlanType = 'starter' | 'pro' | 'premium' | 'enterprise';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'read_only';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'credit_note';
export type PurchaseStatus = 'draft' | 'received' | 'paid' | 'overdue' | 'cancelled';
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'other';
export type StockMovementType = 'purchase' | 'sale' | 'adjustment' | 'transfer' | 'return' | 'opening';
export type TransactionType = 'journal' | 'payment' | 'receipt' | 'transfer' | 'adjustment';
export type ProductType = 'goods' | 'service';

export interface Tenant {
  id: string;
  name: string;
  country: string;
  region?: string;
  city?: string;
  currency: string;
  timezone: string;
  phone_prefix: string;
  plan: PlanType;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  logo_url?: string;
  cachet_url?: string;
  vat_rate: number;
  legal_rccm?: string;
  legal_nif?: string;
  legal_regime?: string;
  bank_details: Record<string, string>;
  sector?: string;
  invoice_prefix: string;
  invoice_counter: number;
  auto_renew?: boolean;
  next_billing_date?: string;
  locked_price_usd?: number;
  referred_by_staff_code?: string;
  billing_cycle?: 'monthly' | 'annual';
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  is_owner: boolean;
  invited_by?: string;
  created_at: string;
}

export interface Account {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  name_en?: string;
  account_class: number;
  account_type: AccountType;
  parent_id?: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Warehouse {
  id: string;
  tenant_id: string;
  name: string;
  address?: string;
  city?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  sku?: string;
  name: string;
  name_en?: string;
  description?: string;
  category?: string;
  product_type: ProductType;
  unit_of_measure: string;
  sale_price: number;
  purchase_price: number;
  vat_rate?: number;
  track_stock: boolean;
  is_active: boolean;
  image_url?: string;
  barcode?: string;
  created_at: string;
  updated_at: string;
}

export interface StockEntry {
  id: string;
  tenant_id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: StockMovementType;
  quantity: number;
  unit_cost: number;
  reference_id?: string;
  reference_type?: string;
  notes?: string;
  offline_id?: string;
  created_by?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  tax_id?: string;
  legal_id?: string;
  payment_terms_days: number;
  credit_limit?: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  tax_id?: string;
  legal_id?: string;
  payment_terms_days: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesInvoiceItem {
  id: string;
  invoice_id: string;
  tenant_id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  sort_order: number;
  product?: Product;
}

export interface SalesInvoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  customer_id?: string;
  warehouse_id?: string;
  status: InvoiceStatus;
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  currency: string;
  exchange_rate: number;
  notes?: string;
  terms?: string;
  payment_method?: string;
  pdf_url?: string;
  sent_at?: string;
  paid_at?: string;
  created_by?: string;
  offline_id?: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  items?: SalesInvoiceItem[];
}

export interface PurchaseInvoiceItem {
  id: string;
  invoice_id: string;
  tenant_id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  sort_order: number;
  product?: Product;
}

export interface PurchaseInvoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  supplier_ref?: string;
  invoice_date: string;
  due_date?: string;
  supplier_id?: string;
  warehouse_id?: string;
  status: PurchaseStatus;
  subtotal: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  currency: string;
  notes?: string;
  payment_method?: string;
  paid_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
  items?: PurchaseInvoiceItem[];
}

export interface Transaction {
  id: string;
  tenant_id: string;
  date: string;
  reference?: string;
  description: string;
  transaction_type: TransactionType;
  is_posted: boolean;
  source_type?: string;
  source_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  lines?: TransactionLine[];
}

export interface TransactionLine {
  id: string;
  transaction_id: string;
  tenant_id: string;
  account_id: string;
  description?: string;
  debit: number;
  credit: number;
  reconciled: boolean;
  account?: Account;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  permissions?: RolePermission[];
}

export interface RolePermission {
  id: string;
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface AuditLog {
  id: string;
  tenant_id?: string;
  user_id?: string;
  action: string;
  module: string;
  record_id?: string;
  before_data?: Record<string, unknown>;
  after_data?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface DashboardStats {
  totalRevenue: number;
  totalPurchases: number;
  outstandingReceivables: number;
  outstandingPayables: number;
  invoiceCount: number;
  customerCount: number;
  productCount: number;
  lowStockCount: number;
}

export interface InternalStaffRole {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  permissions?: InternalStaffRolePermission[];
}

export interface InternalStaffRolePermission {
  id: string;
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface InternalStaffUser {
  id: string;
  user_id: string;
  email: string;
  role_id?: string;
  staff_code?: string;
  is_active: boolean;
  invited_by?: string;
  created_at: string;
  role?: InternalStaffRole;
}

export interface SuperAdmin {
  id: string;
  user_id: string;
  email: string;
  added_by?: string;
  created_at: string;
}

export interface StaffPerformance {
  staff_code: string;
  email: string;
  role_name: string;
  tenants_count: number;
  paid_count: number;
  conversion_rate: number;
  revenue: number;
  total_referrals?: number;
  total_conversions?: number;
  total_revenue_usd?: number;
  last_activity?: string;
}

export interface ReferralEvent {
  id: string;
  staff_code: string;
  tenant_id?: string;
  event_type: 'code_entered' | 'signup' | 'trial_started' | 'trial_converted' | 'trial_expired' | 'churned';
  event_data: Record<string, unknown>;
  created_at: string;
  tenants?: { name: string; plan: string; subscription_status: string } | null;
}

export interface CodeAssignment {
  id: string;
  staff_user_id: string;
  staff_code: string;
  assigned_by?: string;
  action: string;
  notes?: string;
  created_at: string;
  staff?: { email: string; staff_code: string } | null;
}

export interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  trialingTenants: number;
  churnedTenants: number;
  totalUsers: number;
  byCountry: { country: string; count: number }[];
  byPlan: { plan: string; count: number }[];
  revenueByPlan: { plan: string; revenue: number }[];
  mrr: number;
  referralCount: number;
  referralConversion: number;
  churnRate: number;
}

export interface TeamMemberStats {
  user_id: string;
  email: string;
  invoice_count: number;
  total_revenue: number;
}
