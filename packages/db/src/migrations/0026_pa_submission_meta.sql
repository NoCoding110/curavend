-- Gap 4: PA submission tracking (simulated flag + external ref for future clearinghouse)
ALTER TABLE prior_auths ADD COLUMN submission_external_ref TEXT;
ALTER TABLE prior_auths ADD COLUMN submission_simulated INTEGER DEFAULT 0;
