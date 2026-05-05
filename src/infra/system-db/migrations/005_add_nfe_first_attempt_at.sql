ALTER TABLE nfe_email_dispatch_sale
  ADD COLUMN first_attempt_at DATETIME(3) NULL AFTER attempt_count;
