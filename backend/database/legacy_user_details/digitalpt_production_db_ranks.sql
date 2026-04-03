-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Apr 03, 2026 at 03:44 PM
-- Server version: 8.0.45-0ubuntu0.22.04.1
-- PHP Version: 8.2.29

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `tpms`
--

-- --------------------------------------------------------

--
-- Table structure for table `ranks`
--

CREATE TABLE `ranks` (
  `id` bigint NOT NULL,
  `institution_id` bigint NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `local_running_allowance` decimal(10,2) DEFAULT '0.00',
  `transport_per_km` decimal(10,2) DEFAULT '0.00',
  `dsa` decimal(10,2) DEFAULT '0.00' COMMENT 'Daily Subsistence Allowance',
  `dta` decimal(10,2) DEFAULT '0.00' COMMENT 'Daily Transport Allowance',
  `tetfund` decimal(10,2) DEFAULT '0.00' COMMENT 'TETFUND Allowance',
  `priority_number` int NOT NULL DEFAULT '99' COMMENT 'Priority for auto-posting: 1=highest, larger=lower priority. Higher priority supervisors get assigned first and receive longest distance schools',
  `other_allowances` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'Additional allowances as JSON array',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ;

--
-- Dumping data for table `ranks`
--

INSERT INTO `ranks` (`id`, `institution_id`, `name`, `code`, `local_running_allowance`, `transport_per_km`, `dsa`, `dta`, `tetfund`, `priority_number`, `other_allowances`, `status`, `created_at`, `updated_at`) VALUES
(1, 1, 'Chief Lecturer', 'CL', 5000.00, 140.00, 11250.00, 37500.00, 151250.00, 1, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(2, 1, 'Principal Lecturer', 'PL', 5000.00, 140.00, 7500.00, 25000.00, 102500.00, 2, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(3, 1, 'Senior Lecturer', 'SL', 5000.00, 140.00, 7500.00, 25000.00, 102500.00, 3, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(4, 1, 'Lecturer I', 'LI', 5000.00, 140.00, 6000.00, 20000.00, 83000.00, 4, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(5, 1, 'Lecturer II', 'LII', 5000.00, 140.00, 6000.00, 20000.00, 83000.00, 5, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(6, 1, 'Lecturer III', 'LIII', 5000.00, 140.00, 5250.00, 17500.00, 73250.00, 6, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(7, 1, 'Assistant Lecturer', 'AL', 5000.00, 140.00, 5250.00, 17500.00, 73250.00, 7, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(8, 2, 'Professor', 'PROF', 5000.00, 140.00, 11250.00, 37500.00, 151250.00, 1, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(9, 2, 'Reader', 'RD', 5000.00, 140.00, 11250.00, 37500.00, 151250.00, 1, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(10, 2, 'Senior Lecturer', 'SL', 5000.00, 140.00, 11250.00, 37500.00, 151250.00, 1, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(11, 2, 'Lecturer I', 'LI', 5000.00, 140.00, 6000.00, 20000.00, 83000.00, 4, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(12, 2, 'Lecturer II', 'LII', 5000.00, 140.00, 6000.00, 20000.00, 83000.00, 5, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(13, 2, 'Lecturer III', 'LIII', 5000.00, 140.00, 5250.00, 17500.00, 73250.00, 6, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(14, 2, 'Assistant Lecturer', 'AL', 5000.00, 140.00, 5250.00, 17500.00, 73250.00, 7, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(15, 2, 'Graduate Assistant', 'GA', 5000.00, 140.00, 5250.00, 17500.00, 73250.00, 7, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(16, 3, 'Professor', 'PROF', 5000.00, 140.00, 11250.00, 37500.00, 151250.00, 1, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(17, 3, 'Reader', 'RD', 5000.00, 140.00, 11250.00, 37500.00, 151250.00, 1, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(18, 3, 'Senior Lecturer', 'SL', 5000.00, 140.00, 11250.00, 37500.00, 151250.00, 1, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(19, 3, 'Lecturer I', 'LI', 5000.00, 140.00, 6000.00, 20000.00, 83000.00, 4, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(20, 3, 'Lecturer II', 'LII', 5000.00, 140.00, 6000.00, 20000.00, 83000.00, 5, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(21, 3, 'Lecturer III', 'LIII', 5000.00, 140.00, 5250.00, 17500.00, 73250.00, 6, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(22, 3, 'Assistant Lecturer', 'AL', 5000.00, 140.00, 5250.00, 17500.00, 73250.00, 7, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04'),
(23, 3, 'Graduate Assistant', 'GA', 5000.00, 140.00, 5250.00, 17500.00, 73250.00, 7, NULL, 'active', '2025-12-22 05:28:58', '2026-02-03 11:53:04');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `ranks`
--
ALTER TABLE `ranks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_rank_code` (`institution_id`,`code`),
  ADD KEY `idx_institution` (`institution_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_ranks_priority` (`institution_id`,`priority_number`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `ranks`
--
ALTER TABLE `ranks`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `ranks`
--
ALTER TABLE `ranks`
  ADD CONSTRAINT `ranks_ibfk_1` FOREIGN KEY (`institution_id`) REFERENCES `institutions` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
