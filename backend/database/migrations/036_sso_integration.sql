-- Migration: SSO Integration
-- Description: Add tables for SSO partner credentials and SSO logs

-- Partner credentials for SSO integration
CREATE TABLE IF NOT EXISTS sso_partners (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT NOT NULL,
    partner_id VARCHAR(100) NOT NULL UNIQUE,
    secret_key_hash VARCHAR(255) NOT NULL,
    secret_key_hint VARCHAR(10) NULL,
    name VARCHAR(255) NULL,
    allowed_origins TEXT NULL,
    is_enabled TINYINT(1) DEFAULT 1,
    created_by BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sso_partners_institution 
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CONSTRAINT fk_sso_partners_created_by 
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_sso_partners_institution (institution_id),
    INDEX idx_sso_partners_partner_id (partner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SSO login attempt logs
CREATE TABLE IF NOT EXISTS sso_logs (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT NOT NULL,
    partner_id VARCHAR(100) NOT NULL,
    user_type ENUM('student', 'staff') NOT NULL,
    identifier VARCHAR(255) NOT NULL,
    status ENUM('success', 'failed') NOT NULL,
    error_code VARCHAR(50) NULL,
    error_message VARCHAR(255) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sso_logs_institution 
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    INDEX idx_sso_logs_institution (institution_id),
    INDEX idx_sso_logs_partner (partner_id),
    INDEX idx_sso_logs_created (created_at),
    INDEX idx_sso_logs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add SSO enabled flag to institutions if not exists
-- This allows global enable/disable of SSO per institution
ALTER TABLE institutions 
ADD COLUMN IF NOT EXISTS sso_enabled TINYINT(1) DEFAULT 0;
