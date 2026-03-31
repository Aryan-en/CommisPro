
import { GoogleGenAI, Type } from "@google/genai";
import { SalesRecord, CalculationResult, CommissionPeriod } from "../types";

const MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash"];

function parseRetryDelay(err: any): number {
  try {
    const msg = typeof err === 'string' ? err : err?.message || '';
    const match = msg.match(/retry[^0-9]*(\d+(?:\.\d+)?)\s*s/i);
    if (match) return Math.ceil(parseFloat(match[1]));
    const details = err?.details || [];
    for (const d of details) {
      if (d.retryDelay) {
        const seconds = parseInt(String(d.retryDelay).replace('s', ''), 10);
        if (!isNaN(seconds)) return seconds;
      }
    }
  } catch { /* ignore */ }
  return 60;
}

export class QuotaError extends Error {
  retryAfterSeconds: number;
  modelTried: string;
  constructor(message: string, retryAfterSeconds: number, modelTried: string) {
    super(message);
    this.name = 'QuotaError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.modelTried = modelTried;
  }
}

export class GeminiService {
  private getClient() {
    const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("No Gemini API key found. Set GEMINI_API_KEY in your .env.local file.");
    return new GoogleGenAI({ apiKey: key });
  }

  /**
   * Calculates commission using Gemini AI based on provided data and logic.
   */
  async calculateCommission(
    data: SalesRecord[],
    logic: string,
    period?: CommissionPeriod,
    commissionRows?: any[]   // Already-computed commission sheet rows for richer context
  ): Promise<CalculationResult> {
    const ai = this.getClient();
    let lastQuotaErr: QuotaError | null = null;

    const periodContext = period?.startDate && period?.endDate
      ? `Commission period: ${period.startDate} to ${period.endDate}.`
      : "";

    // Pre-aggregate commission rows to minimise token usage
    let dataPayload: any[];
    let dataDescription: string;

    if (commissionRows && commissionRows.length > 0) {
      // Aggregate by owner — send summary rows instead of raw lines
      const ownerMap: Record<string, { owner: string; applied_usd: number; commission: number; eligible: number; lines: number; categories: Set<string> }> = {};
      commissionRows.forEach(r => {
        const owner = r.commission_owner || 'Unknown';
        if (!ownerMap[owner]) ownerMap[owner] = { owner, applied_usd: 0, commission: 0, eligible: 0, lines: 0, categories: new Set() };
        ownerMap[owner].applied_usd += Number(r.applied_amount_usd) || 0;
        ownerMap[owner].commission += Number(r.commission_amount) || 0;
        ownerMap[owner].eligible += r.eligible === 'Yes' ? 1 : 0;
        ownerMap[owner].lines += 1;
        if (r.item_category) ownerMap[owner].categories.add(String(r.item_category).toUpperCase());
      });

      // Also include a sample of raw rows (first 40) for detail queries
      const sampleRows = commissionRows.slice(0, 40).map(r => ({
        owner: r.commission_owner, cat: r.item_category, eligible: r.eligible,
        applied: Number(r.applied_amount_usd || 0).toFixed(2),
        commission: Number(r.commission_amount || 0).toFixed(2),
        customer: r.customer, item: r.items, period: r.commitment_period,
        margin: r.commission_margins, pct: r.commission_percentage
      }));

      dataPayload = [
        { type: 'AGGREGATED_BY_OWNER', data: Object.values(ownerMap).map(o => ({ ...o, categories: [...o.categories].join(',') })) },
        { type: 'SAMPLE_RAW_ROWS_40', data: sampleRows },
        { type: 'TOTALS', total_commission: commissionRows.reduce((s, r) => s + (Number(r.commission_amount) || 0), 0).toFixed(2), total_applied: commissionRows.reduce((s, r) => s + (Number(r.applied_amount_usd) || 0), 0).toFixed(2), total_lines: commissionRows.length }
      ];
      dataDescription = 'Pre-aggregated commission data (owner summaries + 40-row sample):';
    } else {
      dataPayload = data.slice(0, 60);
      dataDescription = 'Raw invoice records (first 60):';
    }

    const prompt = `
You are an expert commission analyst. Apply this logic: "${logic}"
${periodContext}

${dataDescription}
${JSON.stringify(dataPayload)}

Rules:
- Group by salesperson/commission_owner.
- Use commission_amount fields as base unless logic overrides.
- Return accurate numeric totals.
- "notes" = brief explanation of logic applied per person/group.
`.trim();

    for (const model of MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: {
                  type: Type.OBJECT,
                  properties: {
                    totalSales: { type: Type.NUMBER },
                    totalCommission: { type: Type.NUMBER },
                    count: { type: Type.INTEGER }
                  },
                  required: ["totalSales", "totalCommission", "count"]
                },
                details: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      salesperson: { type: Type.STRING },
                      sales: { type: Type.NUMBER },
                      commission: { type: Type.NUMBER },
                      notes: { type: Type.STRING }
                    },
                    required: ["salesperson", "sales", "commission"]
                  }
                }
              },
              required: ["summary", "details"]
            }
          }
        });

        const text = response.text || '{}';
        try {
          return JSON.parse(text) as CalculationResult;
        } catch {
          const clean = text.replace(/```json\n?|```\n?/g, '').trim();
          return JSON.parse(clean) as CalculationResult;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
        if (isQuota) {
          const retryAfter = parseRetryDelay(err);
          lastQuotaErr = new QuotaError(
            `Quota exceeded on model "${model}". Trying next fallback...`,
            retryAfter,
            model
          );
          continue; // try next model
        }
        throw err; // non-quota error — surface immediately
      }
    }

    // All models exhausted
    throw new QuotaError(
      `All Gemini models have exceeded their free-tier quota. Please wait ${lastQuotaErr?.retryAfterSeconds ?? 60} seconds and try again, or upgrade your Gemini API plan at https://ai.dev/rate-limit.`,
      lastQuotaErr?.retryAfterSeconds ?? 60,
      MODELS[MODELS.length - 1]
    );
  }

  /**
   * Uses Gemini to map purchases to invoices based on natural language logic.
   */
  async analyzePurchaseMappings(
    invoices: any[],
    purchases: any[],
    vendorLogic: Record<string, string>
  ): Promise<Record<string, Record<string, number>>> {
    const ai = this.getClient();

    const logicStr = Object.entries(vendorLogic)
      .filter(([, logic]) => logic.trim() !== '')
      .map(([vendor, logic]) => `${vendor}: ${logic}`)
      .join('\n');

    const invoiceContext = invoices.map(i => ({
      no: String(i.invoice_no || i.invoice_number || ''),
      cust: i.customer || i.customer_name || ''
    })).slice(0, 250);

    const purchaseContext = purchases.map(p => ({
      v: p.vendor || p.supplier || p.vendor_name || p.vendor_names || '',
      ref: String(p.invoice_ref || p.reference || p.invoice_no || ''),
      amt: Number(p.amount || p.purchase_amount || 0)
    })).slice(0, 500);

    const response = await ai.models.generateContent({
      model: MODELS[0],
      contents: `
You are an expert forensic accountant. Map PURCHASES to INVOICES using the VENDOR LOGIC.
If logic is vague, use fuzzy matching (e.g., if Invoice is '123' and Purchase Ref is 'PO-123', they match).

VENDOR LOGIC:
${logicStr || "Match purchases to invoices where the invoice number is contained within the purchase reference or is a direct match."}

INVOICES (Target):
${JSON.stringify(invoiceContext)}

PURCHASES (Source):
${JSON.stringify(purchaseContext)}

TASK: Sum all matching purchase amounts for each vendor per invoice.
OUTPUT: Return ONLY a JSON object. Keys = Invoice Numbers, Values = objects where Keys = Vendor Names and Values = SUM of matching amounts.
Example: {"INV-101": {"Vendor A": 500, "Vendor B": 200}}
      `.trim(),
      config: { responseMimeType: "application/json" }
    });

    try {
      const text = response.text || '{}';
      const clean = text.replace(/```json\n?|```\n?/g, '').trim();
      return JSON.parse(clean);
    } catch (e) {
      console.error("Failed to parse AI mapping response", e);
      return {};
    }
  }
}

export const geminiService = new GeminiService();
