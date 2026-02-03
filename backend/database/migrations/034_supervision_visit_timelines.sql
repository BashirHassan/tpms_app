-- Migration: Add Supervision Visit Timelines Table
-- Description: Allows administrators to explicitly set start and end dates for each supervision visit
-- within an academic session, based on max_supervision_visits setting.

-- Create supervision visit timelines table
CREATE TABLE IF NOT EXISTS supervision_visit_timelines (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT NOT NULL,
    session_id BIGINT NOT NULL,
    visit_number INT NOT NULL,                        -- 1, 2, 3, etc. (matches max_supervision_visits)
    title VARCHAR(100) DEFAULT NULL,                  -- Optional custom title (e.g., "First Visit", "Mid-Term Visit")
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT DEFAULT NULL,                    -- Optional notes/instructions for this visit period
    created_by BIGINT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE KEY uk_session_visit (session_id, visit_number),
    CONSTRAINT fk_svt_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CONSTRAINT fk_svt_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_svt_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Indexes
    INDEX idx_svt_institution_session (institution_id, session_id),
    INDEX idx_svt_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add check constraint to ensure end_date >= start_date and visit_number > 0
-- Note: MySQL 8.0.16+ supports CHECK constraints
ALTER TABLE supervision_visit_timelines
ADD CONSTRAINT chk_svt_dates CHECK (end_date >= start_date),
ADD CONSTRAINT chk_svt_visit_number CHECK (visit_number > 0);
