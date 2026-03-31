SELECT 'invoices' AS table_name, COUNT(*) AS row_count FROM invoices
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'purchases', COUNT(*) FROM purchases
UNION ALL SELECT 'vendors', COUNT(*) FROM vendors
UNION ALL SELECT 'quotes', COUNT(*) FROM quotes
UNION ALL SELECT 'fr_mapping', COUNT(*) FROM fr_mapping
UNION ALL SELECT 'quote_override', COUNT(*) FROM quote_override
UNION ALL SELECT 'commit_data', COUNT(*) FROM commit_data
UNION ALL SELECT 'item_list', COUNT(*) FROM item_list;

SELECT id, invoice_number_gen, customer_gen, created_at FROM invoices ORDER BY id DESC LIMIT 20;
SELECT id, invoice_number_gen, document_number_gen, status_gen, created_at FROM payments ORDER BY id DESC LIMIT 20;
SELECT id, customer_gen, vendor_gen, date_gen, created_at FROM purchases ORDER BY id DESC LIMIT 20;
SELECT id, quote_number_gen, account_name_gen, product_name_gen, created_at FROM quotes ORDER BY id DESC LIMIT 20;

SELECT
  i.invoice_number_gen AS invoice_number,
  i.customer_gen AS customer,
  SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(i.raw_data, '$.invoice_amount')) AS DECIMAL(18,2)), 0)) AS invoice_amount_usd,
  SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.raw_data, '$.applied_amount')) AS DECIMAL(18,2)), 0)) AS paid_amount_usd
FROM invoices i
LEFT JOIN payments p
  ON LOWER(COALESCE(p.invoice_number_gen, p.document_number_gen)) = LOWER(i.invoice_number_gen)
GROUP BY i.invoice_number_gen, i.customer_gen
ORDER BY i.invoice_number_gen
LIMIT 50;

SELECT
  i.invoice_number_gen AS invoice_number,
  i.customer_gen AS customer,
  pur.vendor_gen AS vendor,
  SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(pur.raw_data, '$.amount')) AS DECIMAL(18,2)), 0)) AS purchase_amount
FROM invoices i
JOIN purchases pur ON LOWER(pur.customer_gen) = LOWER(i.customer_gen)
GROUP BY i.invoice_number_gen, i.customer_gen, pur.vendor_gen
ORDER BY i.invoice_number_gen
LIMIT 50;
