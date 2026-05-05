ALTER TABLE nfe_email_dispatch_sale
  ADD COLUMN runtime_scope VARCHAR(120) NOT NULL DEFAULT 'production' AFTER nfe_email_dispatch_customer_id,
  DROP INDEX uk_nfe_email_dispatch_sale__customer_sale,
  ADD UNIQUE KEY uk_nfe_email_dispatch_sale__scope_customer_sale
    (runtime_scope, nfe_email_dispatch_customer_id, erp_sale_id),
  ADD KEY idx_nfe_email_dispatch_sale__scope_status
    (runtime_scope, status);
