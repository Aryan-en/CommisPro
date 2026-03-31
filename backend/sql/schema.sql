CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  invoice_number_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.invoice_number'))) STORED,
  customer_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.customer'))) STORED,
  invoice_date_gen VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.invoice_date'))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_invoices_invoice_number (invoice_number_gen),
  INDEX idx_invoices_customer (customer_gen),
  INDEX idx_invoices_date (invoice_date_gen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  invoice_number_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.invoice_number'))) STORED,
  document_number_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.document_number'))) STORED,
  status_gen VARCHAR(128) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.status'))) STORED,
  applied_to_gen VARCHAR(128) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.applied_to'))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_payments_invoice_number (invoice_number_gen),
  INDEX idx_payments_document_number (document_number_gen),
  INDEX idx_payments_status (status_gen),
  INDEX idx_payments_applied_to (applied_to_gen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  customer_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.customer'))) STORED,
  vendor_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.vendor'))) STORED,
  date_gen VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.date'))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_purchases_customer (customer_gen),
  INDEX idx_purchases_vendor (vendor_gen),
  INDEX idx_purchases_date (date_gen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vendors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  vendor_name_gen VARCHAR(255) GENERATED ALWAYS AS (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.vendor_names')), JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.vendor_name')), JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.name')))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_vendors_vendor_name (vendor_name_gen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  quote_number_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.quote_number'))) STORED,
  account_name_gen VARCHAR(255) GENERATED ALWAYS AS (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.account_name')), JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.customer')))) STORED,
  product_name_gen VARCHAR(255) GENERATED ALWAYS AS (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.product_name')), JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.item')))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quotes_quote_number (quote_number_gen),
  INDEX idx_quotes_account_name (account_name_gen),
  INDEX idx_quotes_product_name (product_name_gen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fr_mapping (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  invoice_number_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.invoice_number'))) STORED,
  account_name_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.account_name'))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_fr_mapping_invoice_number (invoice_number_gen),
  INDEX idx_fr_mapping_account_name (account_name_gen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quote_override (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  customer_gen VARCHAR(255) GENERATED ALWAYS AS (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.customer')), JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.account_name')))) STORED,
  item_gen VARCHAR(255) GENERATED ALWAYS AS (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.items')), JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.item')))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_quote_override_customer (customer_gen),
  INDEX idx_quote_override_item (item_gen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS commit_data (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  customer_name_gen VARCHAR(255) GENERATED ALWAYS AS (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.customer_name')), JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.customer')))) STORED,
  item_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.item'))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_commit_data_customer_name (customer_name_gen),
  INDEX idx_commit_data_item (item_gen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS item_list (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw_data JSON NOT NULL,
  item_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.item'))) STORED,
  item_category_gen VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.item_category'))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_item_list_item (item_gen),
  INDEX idx_item_list_item_category (item_category_gen)
) ENGINE=InnoDB;
