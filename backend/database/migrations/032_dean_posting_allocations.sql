-- Migration: Dean Posting Allocations
-- Description: Track posting allocations to deans for faculty-based posting operations
-- 
-- This enables deans to be allocated a number of postings they can create
-- for supervisors within their faculty using the multiposting page.

CREATE TABLE IF NOT EXISTS dean_posting_allocations (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT NOT NULL,
    session_id BIGINT NOT NULL,
    dean_user_id BIGINT NOT NULL,
    allocated_postings INT NOT NULL DEFAULT 0,
    used_postings INT NOT NULL DEFAULT 0,
    allocated_by BIGINT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign keys
    CONSTRAINT fk_dpa_institution 
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CONSTRAINT fk_dpa_session 
        FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_dpa_dean 
        FOREIGN KEY (dean_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dpa_allocated_by 
        FOREIGN KEY (allocated_by) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Unique constraint: one allocation per dean per session
    UNIQUE KEY uk_dean_session (institution_id, session_id, dean_user_id),
    
    -- Index for quick lookups
    INDEX idx_dpa_dean (dean_user_id),
    INDEX idx_dpa_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add column to supervisor_postings for tracking dean-created postings
ALTER TABLE supervisor_postings 
ADD COLUMN created_by_dean_id BIGINT NULL AFTER posted_by,
ADD CONSTRAINT fk_sp_created_by_dean 
    FOREIGN KEY (created_by_dean_id) REFERENCES users(id) ON DELETE SET NULL;

-- Index for dean posting lookups
CREATE INDEX idx_sp_created_by_dean ON supervisor_postings(created_by_dean_id);
