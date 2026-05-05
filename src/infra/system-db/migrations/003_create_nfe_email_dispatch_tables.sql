CREATE TABLE IF NOT EXISTS nfe_email_dispatch_customer (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  erp_customer_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_nfe_email_dispatch_customer__erp_customer_id (erp_customer_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nfe_email_dispatch_sale (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nfe_email_dispatch_customer_id BIGINT UNSIGNED NOT NULL,
  erp_sale_id BIGINT UNSIGNED NOT NULL,
  erp_invoice_key VARCHAR(64) NULL,
  erp_invoice_emitted_at DATETIME(3) NOT NULL,
  status ENUM(
    'PENDING',
    'IN_PROGRESS',
    'SENT',
    'FAILED_TRANSIENT',
    'FAILED_FINAL',
    'DELIVERY_UNKNOWN'
  ) NOT NULL DEFAULT 'PENDING',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_attempt_at DATETIME(3) NULL,
  sent_at DATETIME(3) NULL,
  last_error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_nfe_email_dispatch_sale__customer
    FOREIGN KEY (nfe_email_dispatch_customer_id)
    REFERENCES nfe_email_dispatch_customer (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT,
  UNIQUE KEY uk_nfe_email_dispatch_sale__customer_sale
    (nfe_email_dispatch_customer_id, erp_sale_id),
  KEY idx_nfe_email_dispatch_sale__status (status),
  KEY idx_nfe_email_dispatch_sale__customer_emitted_at
    (nfe_email_dispatch_customer_id, erp_invoice_emitted_at),
  KEY idx_nfe_email_dispatch_sale__invoice_key (erp_invoice_key),
  CONSTRAINT chk_nfe_email_dispatch_sale__in_progress_requires_attempt
    CHECK (
      status <> 'IN_PROGRESS'
      OR last_attempt_at IS NOT NULL
    ),
  CONSTRAINT chk_nfe_email_dispatch_sale__sent_requires_sent_at
    CHECK (
      (status = 'SENT' AND sent_at IS NOT NULL)
      OR
      (status <> 'SENT' AND sent_at IS NULL)
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
