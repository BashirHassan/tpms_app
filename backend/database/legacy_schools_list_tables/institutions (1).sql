-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Mar 28, 2026 at 07:31 PM
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
-- Table structure for table `institutions`
--

CREATE TABLE `institutions` (
  `id` bigint NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subdomain` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Unique subdomain for SaaS routing (e.g., fuk for fuk.sitpms.com)',
  `institution_type` enum('college_of_education','university','polytechnic','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'college_of_education',
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` point DEFAULT NULL COMMENT 'GPS location (POINT) for calculating distances to schools',
  `logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `primary_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#1a5f2a',
  `secondary_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#8b4513',
  `smtp_host` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `smtp_port` int DEFAULT '465',
  `smtp_secure` tinyint(1) DEFAULT '1',
  `smtp_user` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `smtp_password` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `smtp_from_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `smtp_from_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `maintenance_mode` tinyint(1) DEFAULT '0',
  `maintenance_message` text COLLATE utf8mb4_unicode_ci,
  `allow_student_portal` tinyint(1) DEFAULT '1',
  `require_pin_change` tinyint(1) DEFAULT '1',
  `session_timeout_minutes` int DEFAULT '1440',
  `payment_type` enum('per_student','per_session') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'per_student',
  `payment_base_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `payment_currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'NGN',
  `payment_allow_partial` tinyint(1) DEFAULT '0',
  `payment_minimum_percentage` decimal(5,2) DEFAULT '100.00',
  `payment_program_pricing` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `paystack_public_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paystack_secret_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paystack_split_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_enabled` tinyint(1) DEFAULT '0',
  `status` enum('active','inactive','suspended','deleted') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `favicon_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Favicon for browser tab',
  `login_background_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Custom login page background',
  `tagline` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Institution tagline for login page',
  `tp_unit_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Teaching Practice Coordination Unit' COMMENT 'Name of the Teaching Practice unit displayed on documents',
  `sso_enabled` tinyint(1) DEFAULT '0'
) ;

--
-- Dumping data for table `institutions`
--

INSERT INTO `institutions` (`id`, `name`, `code`, `subdomain`, `institution_type`, `email`, `phone`, `address`, `state`, `location`, `logo_url`, `primary_color`, `secondary_color`, `smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`, `smtp_password`, `smtp_from_name`, `smtp_from_email`, `maintenance_mode`, `maintenance_message`, `allow_student_portal`, `require_pin_change`, `session_timeout_minutes`, `payment_type`, `payment_base_amount`, `payment_currency`, `payment_allow_partial`, `payment_minimum_percentage`, `payment_program_pricing`, `paystack_public_key`, `paystack_secret_key`, `paystack_split_code`, `payment_enabled`, `status`, `created_at`, `updated_at`, `favicon_url`, `login_background_url`, `tagline`, `tp_unit_name`, `sso_enabled`) VALUES
(1, 'Demo College of Education', 'DEMOCOE', 'demo', 'college_of_education', 'info@demofce.com', '09088337345', 'Alhajiyel Plaza, Opposite APC Square, Along Bauchi Road Gombe', 'Gombe', NULL, 'https://res.cloudinary.com/dh3diz0fc/image/upload/v1767335788/digitaltp/logos/DEMOCOE/logo-1767335786604.png', '#1a5f2a', '#8b4513', 'smtp.titan.email', 465, 1, 'cloudmail@sistpms.com', 'X+qnEKavkAU6wiSewA9eNQ==:Hp8sc4MNV5txRTO6b4myhw==:rDWLbaVBfJOuIfDIPZEQVfk=', 'DigitalTP App', 'cloudmail@sistpms.com', 0, '', 1, 1, 1440, 'per_student', 5000.00, 'NGN', 0, 50.00, '{\"1\":0,\"2\":0,\"3\":0,\"4\":0,\"5\":0}', '5ih0EdPc9qgJVKGyJLTpFg==:qHUgcnoBfmDHk2mzJEzK0Q==:I2HC4NTYe/Lcxj/QpLWbc9ygKTzZ2locxLqDtnOBGmOCO7/qPOX4V1lKuNf0A+Ot', 'ocU+jV3DAuSeR/b3BTHyww==:kEhy+4R+Sfn0YZC8OALHjg==:1ZQqQiB2ctP7bVAhY6re5+14ah5xPAvCVC/7Plzqe5zPywPW8J3EuFjIqGU+kU0n', '', 1, 'active', '2025-12-20 12:51:12', '2026-01-27 16:43:13', NULL, NULL, NULL, 'Directorate of Teaching Practice', 1),
(6, 'Federal College of Education (Technical) Gombe', 'FCETGOMBE', 'fcetgombe', 'college_of_education', 'info@fcetgombe.edu.ng', '08099382273', 'Alhajiyel Plaza, Opposite APC Square, Along Bauchi Road Gombe', 'Gombe', NULL, 'https://res.cloudinary.com/dh3diz0fc/image/upload/v1767336688/digitaltp/logos/FCETGOMBE/logo-1767336684307.png', '#1a5f2a', '#8b4513', NULL, 465, 1, NULL, NULL, NULL, NULL, 0, NULL, 1, 1, 1440, 'per_session', 0.00, 'NGN', 0, 100.00, NULL, NULL, NULL, NULL, 0, 'active', '2026-01-02 07:00:29', '2026-01-02 07:00:29', NULL, NULL, NULL, 'Teaching Practice Coordination Unit', 0),
(7, 'Federal University Kashere', 'FUK', 'fuk', 'university', '', NULL, NULL, NULL, NULL, NULL, '#1a5f2a', '#8b4513', NULL, 465, 1, NULL, NULL, NULL, NULL, 0, NULL, 1, 1, 1440, 'per_student', 0.00, 'NGN', 0, 100.00, NULL, NULL, NULL, NULL, 0, 'active', '2026-01-02 09:56:52', '2026-01-02 09:57:24', NULL, NULL, 'Excellence in Education', 'Teaching Practice Coordination Unit', 0),
(8, 'Gombe State University', 'GSU', 'gsu', 'university', '', NULL, NULL, NULL, NULL, NULL, '#1e40af', '#f59e0b', NULL, 465, 1, NULL, NULL, NULL, NULL, 0, NULL, 1, 1, 1440, 'per_student', 0.00, 'NGN', 0, 100.00, NULL, NULL, NULL, NULL, 0, 'active', '2026-01-02 09:56:52', '2026-01-02 09:57:31', NULL, NULL, 'Knowledge for Development', 'Teaching Practice Coordination Unit', 0),
(9, 'FCE Technical Gombe', 'FCETG', 'fcetg', 'college_of_education', '', NULL, NULL, NULL, NULL, NULL, '#7c3aed', '#10b981', NULL, 465, 1, NULL, NULL, NULL, NULL, 0, NULL, 1, 1, 1440, 'per_student', 0.00, 'NGN', 0, 100.00, NULL, NULL, NULL, NULL, 0, 'active', '2026-01-02 09:56:52', '2026-01-19 12:29:49', NULL, NULL, 'Technical Excellence', 'Teaching Practice Coordination Unit', 0);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `institutions`
--
ALTER TABLE `institutions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD UNIQUE KEY `subdomain` (`subdomain`),
  ADD KEY `idx_code` (`code`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_payment_enabled` (`payment_enabled`),
  ADD KEY `idx_payment_type` (`payment_type`),
  ADD KEY `idx_institution_type` (`institution_type`),
  ADD KEY `idx_institutions_subdomain` (`subdomain`),
  ADD KEY `idx_institutions_status_subdomain` (`status`,`subdomain`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `institutions`
--
ALTER TABLE `institutions`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
