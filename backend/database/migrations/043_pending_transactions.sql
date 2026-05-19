CREATE TABLE IF NOT EXISTS pending_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  institution_id BIGINT UNSIGNED NOT NULL,
  session_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  reference VARCHAR(100) NOT NULL,
  paystack_reference VARCHAR(100) NULL,
  access_code VARCHAR(200) NULL,
  status ENUM('pending','verified','failed','expired') NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_institution_reference (institution_id, reference),
  INDEX idx_student_session (institution_id, student_id, session_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
