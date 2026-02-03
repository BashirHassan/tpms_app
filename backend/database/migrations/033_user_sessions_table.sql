-- Migration: Add User Sessions Table for Multi-Account Support
-- Enables multiple simultaneous sessions per user with tab-level isolation
-- Each login creates a new session with unique session_id embedded in JWT

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL UNIQUE,  -- Unique session identifier (UUID)
    user_id BIGINT NULL,                      -- For staff users (matches users.id type)
    student_id BIGINT NULL,                   -- For student users (matches students.id type)
    institution_id BIGINT NULL,               -- Matches institutions.id type
    user_type ENUM('staff', 'student') NOT NULL DEFAULT 'staff',
    
    -- Session metadata
    ip_address VARCHAR(45) NULL,              -- IPv4 or IPv6
    user_agent TEXT NULL,
    device_fingerprint VARCHAR(255) NULL,     -- Optional device identification
    
    -- Session lifecycle
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,             -- Use DATETIME instead of TIMESTAMP for explicit values
    revoked_at DATETIME NULL,                 -- Set when session is explicitly invalidated
    
    -- Session status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Indexes for fast lookup
    INDEX idx_session_id (session_id),
    INDEX idx_user_id_active (user_id, is_active),
    INDEX idx_student_id_active (student_id, is_active),
    INDEX idx_institution_id (institution_id),
    INDEX idx_expires_at (expires_at),
    INDEX idx_last_active (last_active_at),
    
    -- Foreign keys
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_institution FOREIGN KEY (institution_id) 
        REFERENCES institutions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comment for documentation
ALTER TABLE user_sessions COMMENT = 'Tracks active user sessions for multi-account support. Each tab login creates a unique session.';
