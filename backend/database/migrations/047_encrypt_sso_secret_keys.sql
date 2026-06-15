-- Migration 047: Encrypt SSO partner secret keys at rest
-- Renames sso_partners.secret_key_hash -> secret_key_encrypted and widens it to
-- hold AES-256-GCM ciphertext (iv:tag:ciphertext, base64).
--
-- The column previously stored the SSO secret in PLAINTEXT (despite its name) and
-- it was re-served on every GET. New writes (create/regenerate) now store the
-- encrypted form via encryptionService.encrypt(). Existing plaintext values are
-- left in place; the SSO verify path transparently reads both encrypted and
-- legacy-plaintext values (a value without two ':' separators is treated as
-- legacy plaintext). Run scripts/encrypt-sso-secrets.js to bulk-encrypt the
-- remaining legacy rows after deploying this migration.

ALTER TABLE sso_partners
  CHANGE COLUMN secret_key_hash secret_key_encrypted VARCHAR(512) NOT NULL;
