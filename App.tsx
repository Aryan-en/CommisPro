
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import Sidebar from './components/Sidebar';
import Uploader from './components/Uploader';
import DataTable from './components/DataTable';
import LogicInput from './components/LogicInput';
import DedupeView from './components/DedupeView';
import { ViewType, CalculationResult, StoreName, ViewStore } from './types';
import { dbService } from './services/db';
import { geminiService, QuotaError } from './services/gemini';

// ─── Shared Style Constants ──────────────────────────────────────────────────
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
const GRID_COLOR = 'rgba(255,255,255,0.04)';
const AXIS_COLOR = '#2d4a72';

interface AuditData {
  invoiceNumber: string; invoices: any[]; payments: any[]; purchases: any[];
  summary: { baseAmount: number; taxAmount: number; paymentAmount: number; netPayment: number; cogs: number; margin: number; matchingLogicUsed: string; customer: string; };
}

// ─── Metric Card ─────────────────────────────────────────────────────────────
const MetricCard: React.FC<{ label: string; value: string; sub?: string; color?: string; icon: React.ReactNode }> = ({ label, value, sub, color = '#3b82f6', icon }) => (
  <div className="card p-5 relative overflow-hidden">
    <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 -translate-y-6 translate-x-6" style={{ background: color }} />
    <div className="flex items-start justify-between mb-4">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}35` }}>
        <span style={{ color }}>{icon}</span>
      </div>
    </div>
    <p className="text-2xl font-black text-white mb-0.5">{value}</p>
    <p className="label">{label}</p>
    {sub && <p className="text-[11px] mt-1" style={{ color: color + 'cc' }}>{sub}</p>}
  </div>
);

// ─── Section Header ───────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="flex items-center justify-between mb-1">
    <div>
      <h3 className="text-sm font-bold text-slate-200">{title}</h3>
      {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ background: '#0f1f3d', border: '1px solid rgba(59,130,246,0.3)', backdropFilter: 'blur(12px)' }}>
      <p className="font-bold text-slate-300 mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>${Number(p.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
      ))}
    </div>
  );
};

// ─── App ─────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [activeStore, setActiveStore] = useState<ViewStore>('invoices');
  const [records, setRecords] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [calcResult, setCalcResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isCalculatingMargin, setIsCalculatingMargin] = useState(false);
  const [auditDetails, setAuditDetails] = useState<AuditData | null>(null);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [ownerCommissions, setOwnerCommissions] = useState<any[]>([]);
  const [isLoadingOwners, setIsLoadingOwners] = useState(false);
  const [isSeedingData, setIsSeedingData] = useState(false);
  const [dashboardData, setDashboardData] = useState<any[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuotaCountdown, setAiQuotaCountdown] = useState<number>(0);
  const [aiCommissionRows, setAiCommissionRows] = useState<any[]>([]);
  const [aiProgress, setAiProgress] = useState<number>(0);
  const [aiLogs, setAiLogs] = useState<{ msg: string; ts: number }[]>([]);

  const [startDate, setStartDate] = useState<string>(() => localStorage.getItem('commispro_start_date') || '');
  const [endDate, setEndDate] = useState<string>(() => localStorage.getItem('commispro_end_date') || '');

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const getVendorName = (v: any) => v.vendor_names || v.vendor_name || v.name || v.vendor || 'Unknown';
  const getVendorLogic = (v: any) => v.margin_logic || v.logic || 'Same Month';

  const fetchVendors = useCallback(async () => { setVendors(await dbService.getAllRecords('vendors')); }, []);

  const isDateMatch = (purchaseDateStr: string, invoiceDateStr: string, logic: string) => {
    const pD = new Date(purchaseDateStr), iD = new Date(invoiceDateStr);
    if (isNaN(pD.getTime()) || isNaN(iD.getTime())) return false;
    const [pM, pY, iM, iY] = [pD.getMonth(), pD.getFullYear(), iD.getMonth(), iD.getFullYear()];
    if (logic.toLowerCase().includes('previous')) {
      let tM = iM - 1, tY = iY;
      if (tM < 0) { tM = 11; tY--; }
      return pM === tM && pY === tY;
    }
    return pM === iM && pY === iY;
  };

  const resolveCustomerName = (orig: string, invNum: string, frMappings: any[]) => {
    if (String(orig).toLowerCase().trim() === 'google' && !/^\d/.test(String(invNum).trim())) {
      const m = frMappings.find(m => String(m.invoice_number || m.invoice_no || '').toLowerCase().trim() === String(invNum).toLowerCase().trim());
      if (m) return m.account_name || m.customer_name || orig;
    }
    return orig;
  };

  const isCommissionEligible = (cat: string, invoiceDate: string, quoteClosedDate: string) => {
    const c = String(cat).toLowerCase().trim();
    if (c === 'rebate') return false;
    if (c === 'services' || c === 'service') return true;
    if (!quoteClosedDate || quoteClosedDate === 'N/A') return false;
    const iD = new Date(invoiceDate), qD = new Date(quoteClosedDate);
    if (isNaN(iD.getTime()) || isNaN(qD.getTime())) return false;
    if (c === 'gcp') { const lim = new Date(qD); lim.setFullYear(lim.getFullYear() + 1); return iD >= qD && iD <= lim; }
    if (c === 'gws' || c === 'gemini') { const lim = new Date(qD); lim.setMonth(lim.getMonth() + 1); return iD >= qD && iD <= lim; }
    const lim = new Date(qD); lim.setFullYear(lim.getFullYear() + 1); return iD >= qD && iD <= lim;
  };

  const getCommissionPercentage = (cp: number) => {
    let p = 0.15;
    if (cp > 12 && cp < 24) p += 0.05;
    else if (cp >= 24) p += 0.10;
    return p;
  };

  // ─── Core Calculation (shared) ───────────────────────────────────────────
  const buildGroupedPayments = (allPayments: any[]) => {
    const g: Record<string, number> = {};
    allPayments.filter(p => {
      const pD = p.date || p.Date;
      if (!pD) return false;
      const d = new Date(pD);
      const s = startDate ? new Date(startDate) : null;
      const e = endDate ? new Date(endDate) : null;
      return (!s || d >= s) && (!e || d <= e)
        && String(p.status || '').toLowerCase() === 'applied'
        && String(p.applied_to || p.Applied_To || '').toLowerCase() === 'invoice';
    }).forEach(p => {
      const inv = String(p.invoice_number || p.document_number || '');
      if (!inv) return;
      const cur = String(p.currency || 'USD').toUpperCase();
      const ex = Number(p.exchange_rate || 1);
      const amt = Number(p.applied_amount || 0);
      g[inv] = (g[inv] || 0) + (cur === 'USD' ? amt : amt * ex);
    });
    return g;
  };

  const calculatePaidInvoicesSummary = async () => {
    const [allPayments, allInvoices, allPurchases, curVendors, frMappings] = await Promise.all([
      dbService.getAllRecords('payments'), dbService.getAllRecords('invoices'),
      dbService.getAllRecords('purchases'), dbService.getAllRecords('vendors'), dbService.getAllRecords('fr_mapping')
    ]);
    const gp = buildGroupedPayments(allPayments);
    return Object.entries(gp).map(([invNum, totalApplied]) => {
      const invStr = invNum.toLowerCase();
      const matching = allInvoices.filter(i => String(i.invoice_no || i.invoice_number || '').toLowerCase() === invStr);
      if (!matching.length) return null;
      const first = matching[0];
      const customer = resolveCustomerName(first.customer || first.customer_name || 'N/A', invNum, frMappings);
      const invDate = first.invoice_date || first.date || 'N/A';
      const cur = String(first.invoice_currency || 'USD').toUpperCase();
      let base = 0, tax = 0;
      matching.forEach(l => { const ex = Number(l.exchange_rate || 1); base += Number(l.invoice_amount || 0) * (cur === 'USD' ? 1 : ex); tax += Number(l.invoice_tax || 0) * (cur === 'USD' ? 1 : ex); });
      let cogs = 0;
      curVendors.forEach(v => {
        const vN = getVendorName(v).toLowerCase(), vL = getVendorLogic(v);
        allPurchases.filter(p => String(p.vendor || p.vendor_name || '').toLowerCase() === vN && String(p.customer || p.customer_name || '').toLowerCase() === customer.toLowerCase() && isDateMatch(String(p.date || ''), invDate, vL))
          .forEach(p => cogs += Number(p.amount || p.purchase_amount || 0));
      });
      const margin = base > 0 ? ((base - cogs) / base) * 100 : 0;
      const total = base + tax;
      const ratio = total > 0 ? totalApplied / total : 0;
      return { invoice_number: invNum, invoice_date: invDate, customer, total_invoice_amount_usd: base, applied_amount_usd: base * ratio, total_tax_usd: tax, invoice_margin: `${margin.toFixed(2)}%`, payment_check: Math.abs(totalApplied - total) < 0.05 ? 'Fully Paid' : 'Partial/Mismatch' };
    }).filter(Boolean).sort((a, b) => String(a?.invoice_number).localeCompare(String(b?.invoice_number), undefined, { numeric: true }));
  };

  const calculateCommissionDetailed = async () => {
    const [allPayments, allInvoices, allPurchases, curVendors, allQuotes, frMappings, quoteOverrides, itemList, commitData] = await Promise.all([
      dbService.getAllRecords('payments'), dbService.getAllRecords('invoices'), dbService.getAllRecords('purchases'),
      dbService.getAllRecords('vendors'), dbService.getAllRecords('quotes'), dbService.getAllRecords('fr_mapping'),
      dbService.getAllRecords('quote_override'), dbService.getAllRecords('item_list'), dbService.getAllRecords('commit_data')
    ]);

    const gp = buildGroupedPayments(allPayments);
    const rows: any[] = [];

    Object.entries(gp).forEach(([invNum, totalApplied]) => {
      const invStr = invNum.toLowerCase();
      const matching = allInvoices.filter(i => String(i.invoice_no || i.invoice_number || '').toLowerCase() === invStr);
      if (!matching.length) return;
      const first = matching[0];
      const customer = resolveCustomerName(first.customer || first.customer_name || 'N/A', invNum, frMappings);
      const invDate = first.invoice_date || first.date || 'N/A';
      const cur = String(first.invoice_currency || 'USD').toUpperCase();

      let base = 0, tax = 0;
      matching.forEach(l => { const ex = Number(l.exchange_rate || 1); base += Number(l.invoice_amount || 0) * (cur === 'USD' ? 1 : ex); tax += Number(l.invoice_tax || 0) * (cur === 'USD' ? 1 : ex); });

      let cogs = 0;
      curVendors.forEach(v => {
        const vN = getVendorName(v).toLowerCase(), vL = getVendorLogic(v);
        allPurchases.filter(p => String(p.vendor || p.vendor_name || '').toLowerCase() === vN && String(p.customer || p.customer_name || '').toLowerCase() === customer.toLowerCase() && isDateMatch(String(p.date || ''), invDate, vL))
          .forEach(p => cogs += Number(p.amount || p.purchase_amount || 0));
      });

      const invoiceMargin = base > 0 ? ((base - cogs) / base) * 100 : 0;
      const total = base + tax;
      const payCheck = Math.abs(totalApplied - total) < 0.05 ? 'Fully Paid' : 'Partial/Mismatch';
      const ratio = total > 0 ? totalApplied / total : 0;

      const findQ = (item: string) => allQuotes.find(q => String(q.account_name || q.customer || '').toLowerCase().trim() === customer.toLowerCase().trim() && String(q.product_name || q.item || '').toLowerCase().trim() === item.toLowerCase().trim());

      matching.forEach(line => {
        const itemName = line.items || line.item || line.description || 'Unnamed';
        const itemTypeRaw = line.item_type || line.type || 'Standard';
        const typeLow = String(itemTypeRaw).toLowerCase();
        if (typeLow.includes('tax') || typeLow.includes('fee') || typeLow.includes('vat')) return;

        const itemAmt = Number(line.invoice_amount || line.amount || 0) * (cur === 'USD' ? 1 : Number(line.exchange_rate || 1));
        const splitApplied = itemAmt * ratio;
        const marginPct = (typeLow === 'services' || typeLow === 'service') ? 50 : invoiceMargin;

        let q = findQ(itemName);
        if (!q) {
          const ov = quoteOverrides.find(o => String(o.customer || o.account_name || '').toLowerCase().trim() === customer.toLowerCase().trim() && String(o.items || o.item || '').toLowerCase().trim() === itemName.toLowerCase().trim());
          if (ov) { const ovItem = ov.product_name_quote || ov.product_name; if (ovItem) q = findQ(ovItem); }
        }

        const owner = q ? (q.sales_rep || q.salesperson || 'No Rep Listed') : 'No Match Found';
        const quoteNum = q ? (q.quote_number || 'N/A') : 'N/A';
        const qCloseDate = q ? (q.quote_closed_date || q.closed_date || q.date || 'N/A') : 'N/A';

        const itemInfo = itemList.find(il => String(il.item || '').toLowerCase().trim() === itemName.toLowerCase().trim());
        const itemCat = itemInfo ? (itemInfo.item_category || itemTypeRaw) : itemTypeRaw;
        const commitFlex = itemInfo ? (itemInfo.commit_flex || 'Flex') : 'Flex';

        const cd = commitData.find(c => String(c.customer_name || c.customer || '').toLowerCase().trim() === customer.toLowerCase().trim() && String(c.item || '').toLowerCase().trim() === itemName.toLowerCase().trim());
        const cp = cd ? Number(cd.commitment_period || 0) : 0;

        const eligible = isCommissionEligible(itemCat, invDate, qCloseDate);
        const commPct = getCommissionPercentage(cp);
        const commAmt = eligible ? splitApplied * (marginPct / 100) * commPct : 0;

        rows.push({
          invoice_number: invNum, invoice_date: invDate, customer,
          items: itemName, item_type: itemTypeRaw, item_category: itemCat,
          commit_flex: commitFlex, commitment_period: cp > 0 ? cp : 'N/A',
          invoice_currency: cur, invoice_amount: Number(line.invoice_amount || line.amount || 0),
          applied_amount_usd: splitApplied, invoice_margin: `${invoiceMargin.toFixed(2)}%`,
          commission_margins: `${marginPct.toFixed(2)}%`, commission_percentage: `${(commPct * 100).toFixed(0)}%`,
          eligible: eligible ? 'Yes' : 'No', commission_amount: commAmt,
          commission_owner: owner, quote_number: quoteNum, quote_closed_date: qCloseDate, payment_check: payCheck
        });
      });
    });

    return rows.sort((a, b) => String(a.invoice_number).localeCompare(String(b.invoice_number), undefined, { numeric: true }));
  };

  // ─── Load Data ───────────────────────────────────────────────────────────
  const loadData = async (store: ViewStore) => {
    try {
      await fetchVendors();
      if (store === 'paid_invoices') setRecords(await calculatePaidInvoicesSummary());
      else if (store === 'commission_calculation') setRecords(await calculateCommissionDetailed());
      else setRecords(await dbService.getAllRecords(store as StoreName));
    } catch (e) { console.error(e); }
  };

  const loadOwnerCommissions = async () => {
    setIsLoadingOwners(true);
    try { setOwnerCommissions(await calculateCommissionDetailed()); }
    catch (e) { console.error(e); }
    finally { setIsLoadingOwners(false); }
  };

  const loadDashboardData = async () => {
    setIsDashboardLoading(true);
    try { setDashboardData(await calculateCommissionDetailed()); }
    catch (e) { console.error(e); }
    finally { setIsDashboardLoading(false); }
  };

  // ─── Audit ────────────────────────────────────────────────────────────────
  const handleInvoiceAudit = async (invNum: string) => {
    const invStr = invNum.toLowerCase();
    const [allInv, allPay, allPur, curV, frM] = await Promise.all([
      dbService.getAllRecords('invoices'), dbService.getAllRecords('payments'),
      dbService.getAllRecords('purchases'), dbService.getAllRecords('vendors'), dbService.getAllRecords('fr_mapping')
    ]);
    const matchInv = allInv.filter(i => String(i.invoice_no || i.invoice_number || '').toLowerCase() === invStr);
    const matchPay = allPay.filter(p => String(p.invoice_number || p.document_number || '').toLowerCase() === invStr);
    const first = matchInv[0] || {};
    const customer = resolveCustomerName(first.customer || first.customer_name || 'N/A', invNum, frM);
    const invDate = first.invoice_date || first.date || 'N/A';
    const matchPur: any[] = [];
    curV.forEach(v => {
      const vN = getVendorName(v).toLowerCase(), vL = getVendorLogic(v);
      allPur.filter(p => String(p.vendor || p.vendor_name || '').toLowerCase() === vN && String(p.customer || p.customer_name || '').toLowerCase() === customer.toLowerCase() && isDateMatch(String(p.date || ''), invDate, vL))
        .forEach(p => matchPur.push(p));
    });
    let base = 0, tax = 0, paid = 0, cogs = 0;
    matchInv.forEach(i => { const ex = Number(i.exchange_rate || 1); base += Number(i.invoice_amount || 0) * ex; tax += Number(i.invoice_tax || 0) * ex; });
    matchPay.forEach(p => paid += Number(p.applied_amount || p.amount || 0) * Number(p.exchange_rate || 1));
    matchPur.forEach(p => cogs += Number(p.amount || p.purchase_amount || 0));
    setAuditDetails({ invoiceNumber: invNum, invoices: matchInv, payments: matchPay, purchases: matchPur, summary: { baseAmount: base, taxAmount: tax, paymentAmount: paid, netPayment: paid - (paid > 0 ? (paid / (base + tax)) * tax : 0), cogs, margin: base > 0 ? ((base - cogs) / base) * 100 : 0, customer, matchingLogicUsed: 'Forensic Lookup via Quote Override and FR Mapping.' } });
  };

  // ─── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => { loadData(activeStore); }, [startDate, endDate, activeStore]);
  useEffect(() => {
    if (currentView === 'commissions') { setActiveStore('commission_calculation'); loadData('commission_calculation'); }
    if (currentView === 'owner_commissions') loadOwnerCommissions();
    if (currentView === 'dashboard') loadDashboardData();
  }, [currentView]);

  // ─── Dashboard Charts Data ────────────────────────────────────────────────
  const chartOwnerData = useMemo(() => {
    if (!dashboardData.length) return [];
    const map: Record<string, number> = {};
    dashboardData.forEach(r => { if (r.commission_owner !== 'No Match Found') map[r.commission_owner] = (map[r.commission_owner] || 0) + (Number(r.commission_amount) || 0); });
    return Object.entries(map).map(([name, commission]) => ({ name: name.split(' ')[0], fullName: name, commission })).sort((a, b) => b.commission - a.commission).slice(0, 8);
  }, [dashboardData]);

  const chartCategoryData = useMemo(() => {
    if (!dashboardData.length) return [];
    const map: Record<string, number> = {};
    dashboardData.forEach(r => { const c = String(r.item_category || 'Other').toUpperCase(); map[c] = (map[c] || 0) + (Number(r.commission_amount) || 0); });
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [dashboardData]);

  const chartTrendData = useMemo(() => {
    if (!dashboardData.length) return [];
    const map: Record<string, { commission: number; revenue: number }> = {};
    dashboardData.forEach(r => {
      const d = String(r.invoice_date || '');
      const m = d.slice(0, 7);
      if (!m || m === 'N/') return;
      if (!map[m]) map[m] = { commission: 0, revenue: 0 };
      map[m].commission += Number(r.commission_amount) || 0;
      map[m].revenue += Number(r.applied_amount_usd) || 0;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, vals]) => ({ month: month.slice(5) + '/' + month.slice(2, 4), ...vals }));
  }, [dashboardData]);

  const dashSummary = useMemo(() => {
    const total = dashboardData.reduce((a, r) => a + (Number(r.commission_amount) || 0), 0);
    const revenue = dashboardData.reduce((a, r) => a + (Number(r.applied_amount_usd) || 0), 0);
    const eligible = dashboardData.filter(r => r.eligible === 'Yes').length;
    const owners = new Set(dashboardData.map(r => r.commission_owner).filter(o => o !== 'No Match Found')).size;
    return { total, revenue, eligible, owners, lines: dashboardData.length };
  }, [dashboardData]);

  // ─── Owner Commissions ────────────────────────────────────────────────────
  const ownerList = useMemo(() => [...new Set(ownerCommissions.map(r => r.commission_owner))].filter(Boolean).sort() as string[], [ownerCommissions]);
  const filteredOwners = useMemo(() => ownerFilter ? ownerList.filter(o => o.toLowerCase().includes(ownerFilter.toLowerCase())) : ownerList, [ownerList, ownerFilter]);
  const ownerSummary = useMemo(() => ownerList.map(owner => {
    const rows = ownerCommissions.filter(r => r.commission_owner === owner);
    return { owner, totalCommission: rows.reduce((a, r) => a + (Number(r.commission_amount) || 0), 0), totalApplied: rows.reduce((a, r) => a + (Number(r.applied_amount_usd) || 0), 0), rowCount: rows.length, eligibleCount: rows.filter(r => r.eligible === 'Yes').length };
  }).sort((a, b) => b.totalCommission - a.totalCommission), [ownerCommissions, ownerList]);

  // ─── Export ───────────────────────────────────────────────────────────────
  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const h = Object.keys(data[0]).join(',');
    const rows = data.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const uri = encodeURI('data:text/csv;charset=utf-8,' + h + '\n' + rows.join('\n'));
    const a = document.createElement('a'); a.href = uri; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ─── Seed Data ────────────────────────────────────────────────────────────
  const handleSeedInitialData = async () => {
    setIsSeedingData(true);
    try {
      const [il, cd] = await Promise.all([dbService.getAllRecords('item_list'), dbService.getAllRecords('commit_data')]);
      if (il.length === 0) {
        await dbService.addRecords('item_list', [
          { item: 'Google Cloud Platform', item_category: 'GCP', commit_flex: 'Commit', commission_logic: 'Eligible within 1 year of quote close date' },
          { item: 'Google Workspace Business Starter', item_category: 'GWS', commit_flex: 'Commit', commission_logic: 'Eligible within 1 month' },
          { item: 'Google Workspace Business Plus', item_category: 'GWS', commit_flex: 'Commit', commission_logic: 'Eligible within 1 month' },
          { item: 'Google Workspace Business Standard', item_category: 'GWS', commit_flex: 'Commit', commission_logic: 'Eligible within 1 month' },
          { item: 'Google Workspace Enterprise', item_category: 'GWS', commit_flex: 'Commit', commission_logic: 'Eligible within 1 month' },
          { item: 'Google Workspace Enterprise Plus', item_category: 'GWS', commit_flex: 'Commit', commission_logic: 'Eligible within 1 month' },
          { item: 'Gemini for Google Workspace', item_category: 'Gemini', commit_flex: 'Commit', commission_logic: 'Eligible within 1 month' },
          { item: 'Gemini Advanced', item_category: 'Gemini', commit_flex: 'Flex', commission_logic: 'Eligible within 1 month' },
          { item: 'BigQuery', item_category: 'GCP', commit_flex: 'Commit', commission_logic: 'Eligible within 1 year' },
          { item: 'Looker', item_category: 'GCP', commit_flex: 'Commit', commission_logic: 'Eligible within 1 year' },
          { item: 'Professional Services', item_category: 'Services', commit_flex: 'Flex', commission_logic: 'All invoices eligible — 50% margin' },
          { item: 'Managed Services', item_category: 'Services', commit_flex: 'Flex', commission_logic: 'All invoices eligible — 50% margin' },
          { item: 'Training Services', item_category: 'Services', commit_flex: 'Flex', commission_logic: 'All invoices eligible — 50% margin' },
          { item: 'Implementation Services', item_category: 'Services', commit_flex: 'Flex', commission_logic: 'All invoices eligible — 50% margin' },
          { item: 'Rebate - GCP', item_category: 'Rebate', commit_flex: 'Flex', commission_logic: 'No commission' },
          { item: 'Rebate - GWS', item_category: 'Rebate', commit_flex: 'Flex', commission_logic: 'No commission' },
          { item: 'Google Maps Platform', item_category: 'GCP', commit_flex: 'Flex', commission_logic: 'Eligible within 1 year' },
          { item: 'Chronicle Security', item_category: 'GCP', commit_flex: 'Commit', commission_logic: 'Eligible within 1 year' },
          { item: 'Vertex AI', item_category: 'GCP', commit_flex: 'Commit', commission_logic: 'Eligible within 1 year' },
          { item: 'AppSheet', item_category: 'GWS', commit_flex: 'Flex', commission_logic: 'Eligible within 1 month' },
        ]);
      }
      if (cd.length === 0) {
        await dbService.addRecords('commit_data', [
          { customer_name: 'Acme Corp', date_signed: '2024-01-15', item: 'Google Cloud Platform', commitment_period: 24 },
          { customer_name: 'Bayze', date_signed: '2024-02-01', item: 'Google Workspace Business Plus', commitment_period: 12 },
          { customer_name: 'Hybrid Tech Solutions', date_signed: '2024-03-10', item: 'Google Workspace Enterprise', commitment_period: 36 },
          { customer_name: 'TechVentures Inc', date_signed: '2024-01-20', item: 'Gemini for Google Workspace', commitment_period: 12 },
          { customer_name: 'Global Systems Ltd', date_signed: '2024-04-05', item: 'Google Cloud Platform', commitment_period: 18 },
          { customer_name: 'DataFlow Corp', date_signed: '2024-02-15', item: 'Google Workspace Business Starter', commitment_period: 24 },
          { customer_name: 'Nexus Innovations', date_signed: '2024-05-01', item: 'Looker', commitment_period: 36 },
          { customer_name: 'CloudFirst Inc', date_signed: '2024-03-22', item: 'Google Cloud Platform', commitment_period: 12 },
          { customer_name: 'Pinnacle Group', date_signed: '2024-06-10', item: 'Google Workspace Enterprise Plus', commitment_period: 24 },
          { customer_name: 'Summit Analytics', date_signed: '2024-01-30', item: 'BigQuery', commitment_period: 18 },
        ]);
      }
      alert(`Done! Item List: ${il.length === 0 ? '20 items added' : 'already had data'}. Commit Data: ${cd.length === 0 ? '10 records added' : 'already had data'}.`);
    } catch (e) { console.error(e); } finally { setIsSeedingData(false); }
  };

  // ─── Audit Modal ─────────────────────────────────────────────────────────
  const renderAuditModal = () => {
    if (!auditDetails) return null;
    const s = auditDetails.summary;
    const marginColor = s.margin >= 40 ? '#10b981' : s.margin >= 20 ? '#f59e0b' : '#ef4444';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,11,20,0.9)', backdropFilter: 'blur(16px)' }}>
        <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: '#09152a', border: '1px solid rgba(59,130,246,0.2)' }}>
          {/* Header */}
          <div className="px-7 py-5 border-b flex justify-between items-center" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(10,22,42,0.8)' }}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Forensic Audit</span>
              </div>
              <h2 className="text-xl font-black text-white">Invoice #{auditDetails.invoiceNumber}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Customer: <span className="text-slate-300 font-semibold">{s.customer}</span></p>
            </div>
            <button onClick={() => setAuditDetails(null)} className="p-2 rounded-xl transition-colors hover:bg-white/5 text-slate-500 hover:text-slate-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-7 space-y-6">
            {/* Margin Hero */}
            <div className="rounded-2xl p-6 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${marginColor}12, ${marginColor}06)`, border: `1px solid ${marginColor}25` }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: marginColor + 'cc' }}>Profit Margin</p>
                <p className="text-5xl font-black" style={{ color: marginColor }}>{s.margin.toFixed(2)}%</p>
              </div>
              <div className="grid grid-cols-3 gap-6 text-right text-xs">
                <div><p className="text-slate-500 mb-1">Revenue</p><p className="font-bold text-slate-200">${s.baseAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div>
                <div><p className="text-slate-500 mb-1">COGS</p><p className="font-bold text-red-400">-${s.cogs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div>
                <div><p className="text-slate-500 mb-1">Net Margin</p><p className="font-bold" style={{ color: marginColor }}>${(s.baseAmount - s.cogs).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div>
              </div>
            </div>

            {/* Revenue */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white">1</div>
                <h3 className="text-sm font-bold text-slate-300">Revenue Records</h3>
              </div>
              <div className="card-inner overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{['Date', 'Amount', 'Tax', 'Total'].map(h => <th key={h} className="px-4 py-3 text-left font-bold" style={{ color: '#4b7bba', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>)}</tr></thead>
                  <tbody>{auditDetails.invoices.map((inv, i) => <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><td className="px-4 py-2.5 text-slate-400">{inv.date || inv.invoice_date}</td><td className="px-4 py-2.5 text-slate-200 font-mono">${Number(inv.invoice_amount || inv.amount || 0).toFixed(2)}</td><td className="px-4 py-2.5 text-slate-400 font-mono">${Number(inv.invoice_tax || inv.tax || 0).toFixed(2)}</td><td className="px-4 py-2.5 text-slate-200 font-mono font-bold">${(Number(inv.invoice_amount || 0) + Number(inv.invoice_tax || 0)).toFixed(2)}</td></tr>)}</tbody>
                  <tfoot><tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}><td className="px-4 py-3 font-bold text-slate-300 text-xs">Total</td><td className="px-4 py-3 font-black text-white font-mono">${s.baseAmount.toFixed(2)}</td><td className="px-4 py-3 font-black text-white font-mono">${s.taxAmount.toFixed(2)}</td><td className="px-4 py-3 font-black text-white font-mono">${(s.baseAmount + s.taxAmount).toFixed(2)}</td></tr></tfoot>
                </table>
              </div>
            </section>

            {/* COGS */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-red-600/70 flex items-center justify-center text-[10px] font-black text-white">2</div>
                <h3 className="text-sm font-bold text-slate-300">Cost of Goods Sold</h3>
                <span className="text-[10px] text-slate-600 italic">{s.matchingLogicUsed}</span>
              </div>
              <div className="card-inner overflow-hidden">
                {!auditDetails.purchases.length ? (
                  <p className="px-4 py-6 text-center text-sm text-red-400 italic">No purchases matched for {s.customer}.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{['Vendor', 'Date', 'Purchase Cost'].map(h => <th key={h} className="px-4 py-3 text-left font-bold" style={{ color: '#4b7bba', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {auditDetails.purchases.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="px-4 py-2.5 text-slate-300">{p.vendor || p.supplier || p.vendor_name || 'Unknown'}</td>
                          <td className="px-4 py-2.5 text-slate-400">{p.date || p.purchase_date || 'N/A'}</td>
                          <td className="px-4 py-2.5 font-mono font-bold text-red-400">-${Number(p.amount || p.purchase_amount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}><td className="px-4 py-3 font-bold text-slate-300 text-xs" colSpan={2}>Aggregate COGS</td><td className="px-4 py-3 font-black text-red-400 font-mono">-${s.cogs.toFixed(2)}</td></tr></tfoot>
                  </table>
                )}
              </div>
            </section>
          </div>

          <div className="px-7 py-4 border-t flex justify-end" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <button onClick={() => setAuditDetails(null)} className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  const fmt$ = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full" style={{ background: 'var(--bg-base)' }}>
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="p-8 max-w-7xl mx-auto space-y-6">

          {/* ── Page Header ── */}
          <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div>
              <p className="label mb-1" style={{ color: 'var(--accent-blue)' }}>CommisPro System</p>
              <h1 className="text-2xl font-black text-white">
                {currentView === 'dashboard' && 'Analytics Dashboard'}
                {currentView === 'database' && 'Data Store Explorer'}
                {currentView === 'commissions' && 'Commission Sheet'}
                {currentView === 'calculator' && 'AI Insights'}
                {currentView === 'dedup' && 'Deduplication'}
                {currentView === 'owner_commissions' && 'Commissions by Owner'}
              </h1>
            </div>
            {currentView === 'dashboard' && (
              <div className="flex gap-3">
                <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); localStorage.setItem('commispro_start_date', e.target.value); }} className="px-3 py-2 rounded-xl text-xs" />
                <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); localStorage.setItem('commispro_end_date', e.target.value); }} className="px-3 py-2 rounded-xl text-xs" />
                <button onClick={loadDashboardData} disabled={isDashboardLoading} className="btn btn-primary">
                  {isDashboardLoading ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/></> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                  Refresh
                </button>
              </div>
            )}
            {currentView === 'database' && (
              <div className="flex flex-wrap gap-2 justify-end max-w-3xl">
                {(['invoices', 'payments', 'purchases', 'vendors', 'quotes', 'fr_mapping', 'quote_override', 'commit_data', 'item_list', 'paid_invoices'] as ViewStore[]).map(s => (
                  <button key={s} onClick={() => setActiveStore(s)} className={`btn text-[11px] ${activeStore === s ? '' : 'btn-ghost'}`} style={activeStore === s ? { background: 'rgba(59,130,246,0.2)', border: '1px solid var(--border-accent)', color: 'var(--accent-blue)' } : {}}>
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── DASHBOARD ── */}
          {currentView === 'dashboard' && (
            <div className="space-y-6 fade-up">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Total Commission" value={fmt$(dashSummary.total)} sub={`${dashSummary.lines} line items`} color="#10b981" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
                <MetricCard label="Applied Revenue" value={fmt$(dashSummary.revenue)} color="#3b82f6" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>} />
                <MetricCard label="Eligible Lines" value={`${dashSummary.eligible}`} sub={`of ${dashSummary.lines} total`} color="#8b5cf6" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
                <MetricCard label="Commission Owners" value={`${dashSummary.owners}`} color="#f59e0b" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>} />
              </div>

              {/* Charts Row 1 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Trend Chart */}
                <div className="card lg:col-span-2 p-6">
                  <SectionHeader title="Commission Trend" subtitle="Monthly commission vs applied revenue" />
                  <div className="mt-4" style={{ height: 220 }}>
                    {chartTrendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartTrendData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                          <XAxis dataKey="month" tick={{ fill: AXIS_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: AXIS_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={1.5} fill="url(#revGrad)" />
                          <Area type="monotone" dataKey="commission" name="Commission" stroke="#3b82f6" strokeWidth={2} fill="url(#commGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-600 text-sm">No data — calculate commissions first</div>
                    )}
                  </div>
                </div>

                {/* Category Donut */}
                <div className="card p-6">
                  <SectionHeader title="By Category" subtitle="Commission split" />
                  <div className="mt-4" style={{ height: 220 }}>
                    {chartCategoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={chartCategoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                            {chartCategoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => fmt$(v)} contentStyle={{ background: '#0f1f3d', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px', fontSize: '11px' }} />
                          <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color: '#64748b', fontSize: '11px' }}>{v}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-600 text-sm">No data</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Charts Row 2 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Owner Bar Chart */}
                <div className="card p-6">
                  <SectionHeader title="Top Owners" subtitle="Commission by sales rep" />
                  <div className="mt-4" style={{ height: 220 }}>
                    {chartOwnerData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartOwnerData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                          <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                          <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="commission" name="Commission" radius={[0, 4, 4, 0]}>
                            {chartOwnerData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-600 text-sm">No data</div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-4">
                  <Uploader onSuccess={t => loadData(t)} />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={async () => { setIsCalculatingMargin(true); setActiveStore('paid_invoices'); await loadData('paid_invoices'); setIsCalculatingMargin(false); }}
                      disabled={isCalculatingMargin}
                      className="px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}
                    >
                      {isCalculatingMargin ? <div className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin"/> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
                      Sync Invoices
                    </button>
                    <button onClick={() => setCurrentView('commissions')} className="px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.15))', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                      Commission Sheet
                    </button>
                    <button onClick={() => setCurrentView('owner_commissions')} className="px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      By Owner
                    </button>
                    <button onClick={handleSeedInitialData} disabled={isSeedingData} className="px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#64748b' }}>
                      {isSeedingData ? <div className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin"/> : '🌱'}
                      Seed Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── COMMISSIONS ── */}
          {currentView === 'commissions' && (
            <div className="space-y-5 fade-up">
              {/* Summary Banner */}
              <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f1f3d 0%, #0d1a30 100%)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 90% 50%, rgba(59,130,246,0.4), transparent 60%)' }} />
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">Commission Working Sheet</p>
                    <h2 className="text-2xl font-black text-white">Detailed Line Items</h2>
                    <p className="text-sm text-slate-500 mt-1">Eligibility · Commitment Period · Commission Amount per invoice line</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => exportCSV(records.filter(r => r.commission_owner === 'No Match Found'), `unmatched_${new Date().toISOString().split('T')[0]}.csv`)} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      Export Unmatched
                    </button>
                    <button onClick={() => exportCSV(records, `commissions_all_${new Date().toISOString().split('T')[0]}.csv`)} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399' }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                      Export All
                    </button>
                  </div>
                </div>
              </div>

              {/* KPI Row */}
              {records.length > 0 && (() => {
                const tc = records.reduce((a, r) => a + (Number(r.commission_amount) || 0), 0);
                const tr = records.reduce((a, r) => a + (Number(r.applied_amount_usd) || 0), 0);
                const el = records.filter(r => r.eligible === 'Yes').length;
                return (
                  <div className="grid grid-cols-3 gap-4">
                    <MetricCard label="Total Commission" value={fmt$(tc)} color="#10b981" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
                    <MetricCard label="Applied Revenue" value={fmt$(tr)} color="#3b82f6" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>} />
                    <MetricCard label="Eligible Lines" value={`${el} / ${records.length}`} color="#8b5cf6" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
                  </div>
                );
              })()}

              <DataTable data={records} onInvoiceClick={handleInvoiceAudit} />
            </div>
          )}

          {/* ── OWNER COMMISSIONS ── */}
          {currentView === 'owner_commissions' && (
            <div className="space-y-5 fade-up">
              <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #120d2e 0%, #0d1a30 100%)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 90% 50%, rgba(139,92,246,0.5), transparent 60%)' }} />
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-1">Sales Performance</p>
                    <h2 className="text-2xl font-black text-white">Commissions by Owner</h2>
                    <p className="text-sm text-slate-500 mt-1">Individual commission tables per sales representative</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-1">Owners</p>
                    <p className="text-4xl font-black text-white">{ownerList.length}</p>
                  </div>
                </div>
              </div>

              {isLoadingOwners ? (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center">
                    <div className="w-14 h-14 border-2 border-violet-800 border-t-violet-500 rounded-full animate-spin mx-auto mb-4"/>
                    <p className="text-sm text-slate-500">Calculating commissions...</p>
                  </div>
                </div>
              ) : ownerCommissions.length === 0 ? (
                <div className="card p-16 text-center">
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <h3 className="text-base font-bold text-slate-200 mb-2">No Commission Data</h3>
                  <button onClick={() => setCurrentView('commissions')} className="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>Go to Commissions</button>
                </div>
              ) : (
                <>
                  {/* Summary Table */}
                  <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Owner Summary</p>
                      <input type="text" placeholder="Filter owner..." value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }} />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'rgba(10,20,38,0.8)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {['Owner', 'Total Commission', 'Applied Revenue', 'Lines', 'Eligible', 'Export'].map(h => (
                              <th key={h} className="px-5 py-3.5" style={{ color: '#4b7bba', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: h === 'Owner' ? 'left' : 'right' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ownerSummary.filter(s => !ownerFilter || s.owner.toLowerCase().includes(ownerFilter.toLowerCase())).map((s, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td className="px-5 py-3.5 font-semibold text-slate-300">{s.owner}</td>
                              <td className="px-5 py-3.5 text-right font-black font-mono" style={{ color: '#34d399' }}>{fmt$(s.totalCommission)}</td>
                              <td className="px-5 py-3.5 text-right font-mono text-slate-400">{fmt$(s.totalApplied)}</td>
                              <td className="px-5 py-3.5 text-right text-slate-500">{s.rowCount}</td>
                              <td className="px-5 py-3.5 text-right"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>{s.eligibleCount}</span></td>
                              <td className="px-5 py-3.5 text-right"><button onClick={() => exportCSV(ownerCommissions.filter(r => r.commission_owner === s.owner), `commission_${s.owner.replace(/\s+/g, '_')}.csv`)} className="px-3 py-1 rounded-lg text-[11px] font-bold transition-all" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>CSV</button></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '2px solid rgba(255,255,255,0.08)', background: 'rgba(10,20,38,0.5)' }}>
                            <td className="px-5 py-3.5 font-black text-slate-200">TOTAL</td>
                            <td className="px-5 py-3.5 text-right font-black font-mono" style={{ color: '#34d399' }}>{fmt$(ownerSummary.reduce((a, s) => a + s.totalCommission, 0))}</td>
                            <td className="px-5 py-3.5 text-right font-bold font-mono text-slate-400">{fmt$(ownerSummary.reduce((a, s) => a + s.totalApplied, 0))}</td>
                            <td className="px-5 py-3.5 text-right font-bold text-slate-400">{ownerSummary.reduce((a, s) => a + s.rowCount, 0)}</td>
                            <td className="px-5 py-3.5 text-right"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>{ownerSummary.reduce((a, s) => a + s.eligibleCount, 0)}</span></td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Individual Owner Tables */}
                  {filteredOwners.map(owner => {
                    const rows = ownerCommissions.filter(r => r.commission_owner === owner);
                    const total = rows.reduce((a, r) => a + (Number(r.commission_amount) || 0), 0);
                    const catColors: Record<string, string> = { gcp: '#60a5fa', gws: '#34d399', gemini: '#a78bfa', services: '#fbbf24', rebate: '#f87171' };
                    return (
                      <div key={owner} className="card overflow-hidden">
                        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(10,20,38,0.6)' }}>
                          <div>
                            <p className="text-base font-black text-white">{owner}</p>
                            <p className="text-[11px] mt-0.5 text-slate-500">{rows.length} lines · {rows.filter(r => r.eligible === 'Yes').length} eligible</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Commission</p>
                              <p className="text-xl font-black font-mono" style={{ color: '#34d399' }}>{fmt$(total)}</p>
                            </div>
                            <button onClick={() => exportCSV(rows, `commission_${owner.replace(/\s+/g, '_')}.csv`)} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>Export</button>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ background: 'rgba(10,18,35,0.9)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                {['Invoice #', 'Date', 'Customer', 'Item', 'Category', 'Commit/Flex', 'Period', 'Applied USD', 'Margin', 'Comm %', 'Eligible', 'Commission'].map(h => (
                                  <th key={h} className="px-4 py-3 text-left whitespace-nowrap" style={{ color: '#4b7bba', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', opacity: r.eligible === 'No' ? 0.55 : 1 }}>
                                  <td className="px-4 py-2.5 font-mono font-bold" style={{ color: '#60a5fa' }}>{r.invoice_number}</td>
                                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.invoice_date}</td>
                                  <td className="px-4 py-2.5 text-slate-400 max-w-[130px] truncate">{r.customer}</td>
                                  <td className="px-4 py-2.5 text-slate-300 max-w-[130px] truncate">{r.items}</td>
                                  <td className="px-4 py-2.5">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${catColors[String(r.item_category).toLowerCase()] || '#94a3b8'}18`, color: catColors[String(r.item_category).toLowerCase()] || '#94a3b8', border: `1px solid ${catColors[String(r.item_category).toLowerCase()] || '#94a3b8'}30` }}>{r.item_category}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500">{r.commit_flex}</td>
                                  <td className="px-4 py-2.5 text-slate-500">{r.commitment_period}</td>
                                  <td className="px-4 py-2.5 font-mono text-slate-300">${Number(r.applied_amount_usd || 0).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</td>
                                  <td className="px-4 py-2.5 font-mono" style={{ color: '#fbbf24' }}>{r.commission_margins}</td>
                                  <td className="px-4 py-2.5 font-mono font-bold text-slate-300">{r.commission_percentage}</td>
                                  <td className="px-4 py-2.5">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={r.eligible === 'Yes' ? { background: 'rgba(16,185,129,0.15)', color: '#34d399' } : { background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>{r.eligible}</span>
                                  </td>
                                  <td className="px-4 py-2.5 font-mono font-black" style={{ color: '#34d399' }}>${Number(r.commission_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: '2px solid rgba(255,255,255,0.07)', background: 'rgba(10,18,35,0.6)' }}>
                                <td colSpan={11} className="px-4 py-3 font-bold text-slate-400 text-right text-xs">Total Commission:</td>
                                <td className="px-4 py-3 font-black font-mono" style={{ color: '#34d399' }}>{fmt$(total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── AI CALCULATOR ── */}
          {currentView === 'calculator' && (
            <div className="space-y-5 fade-up">
              {/* Header */}
              <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #130f2e, #0d1a30)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div className="absolute inset-0 opacity-25" style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(99,102,241,0.5), transparent 60%)' }} />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))', border: '1px solid rgba(139,92,246,0.3)' }}>
                      <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-0.5">Powered by Gemini 2.0 Flash</p>
                      <h2 className="text-xl font-black text-white">AI Commission Insights</h2>
                      <p className="text-sm text-slate-500 mt-0.5">Runs on your calculated commission data — apply custom logic, ask questions, or explore scenarios</p>
                    </div>
                  </div>
                  {/* Data status */}
                  <div className="flex flex-col gap-2 text-right flex-shrink-0">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] text-slate-500">Commission rows loaded:</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: aiCommissionRows.length > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: aiCommissionRows.length > 0 ? '#34d399' : '#f87171', border: `1px solid ${aiCommissionRows.length > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                        {aiCommissionRows.length}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const rows = await calculateCommissionDetailed();
                          setAiCommissionRows(rows);
                        } catch (e) { console.error(e); }
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 justify-end"
                      style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      Load Commission Data
                    </button>
                  </div>
                </div>
              </div>

              {/* How it works info */}
              <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <svg className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p className="text-xs text-indigo-300">
                  <strong>How it works:</strong> Click <em>Load Commission Data</em> first to feed the AI your calculated commission rows. Then describe what you want — e.g. "Show me the top 5 earners", "Apply an extra 2% bonus for GCP deals", or "Summarise commissions by item category".
                </p>
              </div>

              <LogicInput
                onCalculate={async (logic) => {
                  setAiError(null);
                  setCalcResult(null);
                  setAiProgress(0);
                  setAiLogs([]);

                  const log = (msg: string) => setAiLogs(prev => [...prev, { msg, ts: Date.now() }]);
                  const progress = (pct: number) => setAiProgress(pct);

                  log('Reading data from backend API...');
                  progress(5);
                  const invoices = await dbService.getAllRecords('invoices');
                  if (!invoices.length && !aiCommissionRows.length) {
                    setAiError('No data available. Upload invoices or click "Load Commission Data" first.');
                    return;
                  }

                  setIsCalculating(true);
                  log(`Loaded ${aiCommissionRows.length > 0 ? aiCommissionRows.length + ' commission rows' : invoices.length + ' invoices'}`);
                  progress(15);

                  // Simulate realistic progress steps while API call runs
                  const steps: [number, string][] = [
                    [25, 'Pre-aggregating data by owner...'],
                    [38, 'Building compact prompt payload...'],
                    [50, 'Sending request to Gemini AI...'],
                    [62, 'AI is reading commission data...'],
                    [74, 'AI is applying your logic...'],
                    [85, 'AI is computing totals & groupings...'],
                    [93, 'Finalising response...'],
                  ];
                  let stepIdx = 0;
                  const stepInterval = setInterval(() => {
                    if (stepIdx < steps.length) {
                      const [pct, msg] = steps[stepIdx++];
                      progress(pct);
                      log(msg);
                    } else {
                      clearInterval(stepInterval);
                    }
                  }, 800);

                  try {
                    const result = await geminiService.calculateCommission(
                      invoices,
                      logic,
                      { startDate, endDate },
                      aiCommissionRows.length > 0 ? aiCommissionRows : undefined
                    );
                    clearInterval(stepInterval);
                    progress(100);
                    log('✓ Analysis complete!');
                    setCalcResult(result);
                  } catch (err: any) {
                    clearInterval(stepInterval);
                    progress(0);
                    if (err instanceof QuotaError) {
                      setAiError(err.message);
                      log('✗ Quota exceeded — rate limited by API');
                      setAiQuotaCountdown(err.retryAfterSeconds);
                      const interval = setInterval(() => {
                        setAiQuotaCountdown(prev => {
                          if (prev <= 1) { clearInterval(interval); return 0; }
                          return prev - 1;
                        });
                      }, 1000);
                    } else {
                      log('✗ ' + (err?.message || 'Request failed'));
                      setAiError(err?.message || 'AI request failed. Check your API key and try again.');
                    }
                  } finally {
                    setIsCalculating(false);
                  }
                }}
                isLoading={isCalculating}
              />

              {/* Progress */}
              {(isCalculating || (aiLogs.length > 0 && aiProgress < 100 && !aiError)) && (
                <div className="card p-5 space-y-4">
                  {/* Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Analyzing with Gemini AI</p>
                      <span className="text-xs font-black font-mono" style={{ color: aiProgress === 100 ? 'var(--accent-emerald)' : 'var(--accent-violet)' }}>{aiProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${aiProgress}%`,
                          background: aiProgress === 100
                            ? 'linear-gradient(90deg, #10b981, #34d399)'
                            : 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)',
                          boxShadow: aiProgress > 0 ? '0 0 12px rgba(139,92,246,0.5)' : 'none',
                        }}
                      />
                    </div>
                  </div>
                  {/* Logs */}
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {aiLogs.map((entry, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="text-[10px] font-mono mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {new Date(entry.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        {i === aiLogs.length - 1 && isCalculating ? (
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3 h-3 animate-spin flex-shrink-0" style={{ color: 'var(--accent-violet)' }} fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{entry.msg}</span>
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: entry.msg.startsWith('✓') ? 'var(--accent-emerald)' : entry.msg.startsWith('✗') ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                            {entry.msg}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed progress (brief show after done) */}
              {!isCalculating && aiProgress === 100 && aiLogs.length > 0 && calcResult && (
                <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-emerald)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent-emerald)' }}>Analysis complete — {aiLogs.length} steps processed</span>
                </div>
              )}

              {/* Error */}
              {aiError && (
                <div className="rounded-xl px-5 py-4 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-red)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>
                      {aiQuotaCountdown > 0 ? 'Quota Exceeded — Rate Limited' : 'Error'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#fca5a5' }}>{aiError}</p>
                    {aiQuotaCountdown > 0 && (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <svg className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent-red)' }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          <span className="text-xs font-bold font-mono" style={{ color: 'var(--accent-red)' }}>Retry in {aiQuotaCountdown}s</span>
                        </div>
                        <a href="https://ai.dev/rate-limit" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline" style={{ color: '#fca5a5' }}>Upgrade API Plan ↗</a>
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setAiError(null); setAiQuotaCountdown(0); }} style={{ color: '#f87171' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              )}

              {/* Results */}
              {calcResult && (
                <div className="card overflow-hidden">
                  {/* Summary banner */}
                  <div className="px-6 py-5 border-b grid grid-cols-3 gap-6" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(10,18,35,0.8)' }}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Total Commission</p>
                      <p className="text-3xl font-black font-mono" style={{ color: '#34d399' }}>{fmt$(calcResult.summary.totalCommission)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Total Sales Analyzed</p>
                      <p className="text-3xl font-black font-mono text-white">{fmt$(calcResult.summary.totalSales)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Records</p>
                      <p className="text-3xl font-black font-mono text-white">{calcResult.summary.count.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Bar chart of details */}
                  {calcResult.details.length > 0 && (
                    <div className="px-6 pt-5 pb-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Commission by Person / Group</p>
                      <div style={{ height: Math.min(300, calcResult.details.length * 44 + 40) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={calcResult.details.slice(0, 15)} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                            <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="salesperson" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                            <Tooltip
                              formatter={(v: any, name: string) => [fmt$(v), name]}
                              contentStyle={{ background: '#0f1f3d', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px', fontSize: '11px' }}
                            />
                            <Bar dataKey="commission" name="Commission" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#34d399', fontSize: 10, formatter: (v: any) => fmt$(v) }}>
                              {calcResult.details.slice(0, 15).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Table */}
                  <div className="px-6 pb-6 pt-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Detailed Breakdown</p>
                    <DataTable data={calcResult.details.map(d => ({
                      salesperson: d.salesperson,
                      sales: d.sales,
                      commission: d.commission,
                      ...(d.notes ? { notes: d.notes } : {})
                    }))} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── DATABASE ── */}
          {currentView === 'database' && (
            <div className="space-y-4 fade-up">
              <div className="card px-5 py-3.5 flex justify-between items-center">
                <p className="text-xs text-slate-500">Showing <span className="font-bold text-slate-300">{records.length.toLocaleString()}</span> records in <span className="font-bold" style={{ color: '#60a5fa' }}>{activeStore}</span></p>
                {['invoices', 'payments', 'purchases', 'vendors', 'quotes', 'fr_mapping', 'quote_override', 'commit_data', 'item_list'].includes(activeStore) && (
                  <button
                    onClick={async () => { if (confirm(`Clear all records from ${activeStore}?`)) { await dbService.clearStore(activeStore as StoreName); if (activeStore === 'vendors') setVendors([]); loadData(activeStore); } }}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
                  >
                    Wipe Table
                  </button>
                )}
              </div>
              <DataTable data={records} onInvoiceClick={activeStore === 'paid_invoices' ? handleInvoiceAudit : undefined} />
            </div>
          )}

          {/* ── DEDUP ── */}
          {currentView === 'dedup' && <DedupeView />}

        </div>
      </main>

      {renderAuditModal()}
    </div>
  );
};

export default App;
