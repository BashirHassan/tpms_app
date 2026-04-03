-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Apr 03, 2026 at 03:35 PM
-- Server version: 11.8.6-MariaDB-log
-- PHP Version: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `u440761987_gsu_tpms`
--

-- --------------------------------------------------------

--
-- Table structure for table `tbl_tp_supervisors`
--

CREATE TABLE `tbl_tp_supervisors` (
  `id` int(7) NOT NULL,
  `fullname` varchar(50) NOT NULL,
  `fileno` varchar(15) NOT NULL,
  `rank_id` int(5) NOT NULL,
  `email` varchar(50) NOT NULL,
  `phone` varchar(15) NOT NULL,
  `department_id` int(5) NOT NULL,
  `status` int(5) NOT NULL,
  `date_created` datetime NOT NULL DEFAULT current_timestamp(),
  `date_updated` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tbl_tp_supervisors`
--

INSERT INTO `tbl_tp_supervisors` (`id`, `fullname`, `fileno`, `rank_id`, `email`, `phone`, `department_id`, `status`, `date_created`, `date_updated`) VALUES
(36, 'PROF. M. G. DUKKU', '0007', 2, 'mgurama@gsu.edu.ng', '08037037462', 14, 1, '2024-08-28 11:36:57', '2025-09-18 17:39:16'),
(32, 'DR. JARUMI TIMOTHY ALIYU', '0028', 5, 'aliyu1958@gmail.com', '08139774867', 13, 1, '2024-08-28 10:41:55', '2025-09-18 17:37:25'),
(20, 'DR. MUHAMMAD  DAUDA  KALA', '0030', 3, 'mkala5019@gsu.edu.ng', '08088765557', 15, 1, '2024-08-22 16:02:33', '2026-01-01 12:56:40'),
(21, 'DR. ZUBAIRU SULEIMAN', '0031', 4, 'zubairusulain@gsu.edu.ng', '08034499774', 15, 1, '2024-08-22 16:04:43', '2025-09-18 17:47:48'),
(18, 'PROF. ADEPOJU OLUWASANUMI ADEDIMEJI', '0178', 2, 'sanudepoju@gsu.edu.com', '08138061908', 15, 1, '2024-08-22 15:56:12', '2025-09-18 17:47:15'),
(30, 'PROF. SANI AHMED YAUTA', '0336', 2, 'sayauta@gsu.edu.ng', '08035939644', 14, 1, '2024-08-22 19:31:04', '2025-09-18 17:39:30'),
(22, 'MR. DANJUMA SHEHU IBRAHIM', '0339', 5, 'Idshehu0016@gsu.edu.ng', '08036316040', 15, 1, '2024-08-22 16:07:52', '2025-09-18 17:48:25'),
(16, 'DR. ESROM TORO JOKTHAN', '0347', 3, 'etjokthan@gmail.com', '08059148244', 14, 1, '2024-08-22 12:28:41', '2025-09-18 17:39:46'),
(31, 'DR. CHARLES ZAURE SABE', '0402', 3, 'scharleszaure@gsu.edu.ng', '08020869199', 13, 1, '2024-08-28 10:41:05', '2025-09-18 17:37:49'),
(13, 'MRS. AISHATU MOHAMMED HAMMA', '0701', 5, 'aishatuh@gsu.edu.ng', '07030752831', 14, 1, '2024-08-22 12:25:15', '2025-09-18 17:40:02'),
(1, 'DR. JUMMAI IBRAHIM SAGIR', '0702', 4, 'jummaisagir@gsu.edu.ng', '08036933968', 14, 1, '2024-08-22 11:50:29', '2025-09-18 17:40:21'),
(34, 'DR. HADIZA HUSSAINI', '0729', 5, 'hadizah@gsu.edu.ng', '07030382848', 13, 1, '2024-08-28 10:43:18', '2025-09-26 06:32:43'),
(7, 'MRS. FATIMA BALA SANI', '0754', 5, 'sani.fb@gsu.edu.ng', '08038895352', 14, 1, '2024-08-22 12:14:00', '2025-09-18 17:40:34'),
(11, 'DR. SOLOMON GARBA', '0797', 4, 'solomongarba@gsu.edu.ng', '08036082796', 14, 1, '2024-08-22 12:23:35', '2025-09-18 17:41:05'),
(37, 'MR. IBRAHIM BELLO', '0827', 5, 'ibrahimbellogunduma@gsu.edu.ng', '08039627772', 14, 1, '2025-08-25 10:18:51', '2025-09-18 17:41:30'),
(8, 'MR. BIBI MESHAK', '0831', 5, 'bibimeshak78@gsu.edu.ng', '08065129297', 14, 1, '2024-08-22 12:21:05', '2025-09-18 17:41:40'),
(2, 'DR. ER PETER LUKA', '0837', 5, 'erlucaser@gsu.edu.ng', '07033026055', 14, 1, '2024-08-22 11:51:39', '2025-09-18 17:41:56'),
(33, 'MRS. JAMILA ABUBAKAR USMAN', '0926', 5, 'jamilausman2012@gmail.com', '08069093529', 13, 1, '2024-08-28 10:42:35', '2025-09-18 17:38:16'),
(28, 'MR. IBRAHIM BOMALA ADAMU', '0961', 5, 'bomalapresidor@yahoo.com', '08035957147', 15, 1, '2024-08-22 16:18:06', '2025-09-18 17:49:09'),
(23, 'MRS. AISHATU ABDULKARIM', '0962', 5, 'aishatkwami@gsu.edu.ng', '07067177049', 15, 1, '2024-08-22 16:09:13', '2025-09-18 17:49:26'),
(12, 'MRS. ISA FATI  WAZIRI', '1034', 5, 'fatimaisawaziri@gsu.edu.ng', '08036799731', 14, 1, '2024-08-22 12:24:26', '2026-01-23 11:11:30'),
(9, 'MR. JOEL DOGO', '1035', 5, 'Joel@gsu.edu.ng', '08068411441', 14, 1, '2024-08-22 12:22:01', '2025-09-18 17:42:26'),
(29, 'MRS. HAUWA ABUBAKAR', '1096', 6, 'hauwakumo20@gmail.com', '08062378776', 15, 1, '2024-08-22 16:20:58', '2025-09-18 17:49:49'),
(19, 'PROF. MARY ERASMUS SULAI', '1164', 2, 'mary.sulai@gsu.edu.ng', '08036867589', 15, 1, '2024-08-22 15:58:18', '2025-09-18 17:50:08'),
(43, 'MR. AL-AMIN MOHAMMED', '1222', 5, 'alameenalfira@gmail.com', '08039511789', 15, 1, '2025-09-14 09:41:57', '2025-09-18 17:50:27'),
(14, 'HASSAN USMAN EL-RASHEED', '1303', 6, 'elrasheedhassan@gsu.edu.ng', '08036070446', 1, 0, '2024-08-22 12:26:01', '2025-09-14 08:12:11'),
(15, 'DR. HABIBA ISAH', '1412', 4, 'habibaisah@gsu.edu.ng', '08033072041', 14, 1, '2024-08-22 12:27:13', '2025-09-18 17:43:21'),
(42, 'MRS. AISHA ZUBAIR UMAR', '1419', 7, 'aishazubairumar@gmail.com', '08036924403', 1, 0, '2025-09-14 09:04:16', '2025-09-14 10:19:35'),
(4, 'MRS. AISHATU ABUBAKAR TONGO', '1421', 6, 'aishatuabubakaraa@gmail.com', '07037444818', 14, 1, '2024-08-22 11:56:30', '2025-09-18 17:43:39'),
(17, 'MR. ABUBAKAR MUHAMMED KOLE', '1422', 7, 'makole@gsu.edu.ng', '08060847118', 14, 1, '2024-08-22 12:30:11', '2025-09-18 17:44:10'),
(3, 'MR. MUSA ABUBAKAR MAIKAMBA', '1456', 6, 'maikamba@gsu.edu.ng', '08029149361', 14, 1, '2024-08-22 11:54:50', '2025-09-18 17:44:29'),
(35, 'MR. YUGUDA FAROUQ UMAR', '1482', 8, 'ubyuguda@gsu.edu.ng', '08036723330', 13, 1, '2024-08-28 10:44:06', '2025-09-23 10:42:23'),
(41, 'MRS. MARYAM UMAR BACCIJI', '1487', 7, 'mairobacciji@gmail.com', '07061974720', 14, 1, '2025-09-14 08:57:47', '2025-09-18 17:44:47'),
(26, 'MR. IBRAHIM MOHAMMED', '1488', 7, 'ibraheemy@gsu.edu.ng', '08030801914', 15, 1, '2024-08-22 16:12:52', '2025-09-18 17:50:58'),
(25, 'MR. MUKTAR UMAR ARDO', '1490', 7, 'muktarumar.mu@gsu.edu.ng', '07066583830', 15, 1, '2024-08-22 16:11:21', '2025-09-18 17:51:15'),
(27, 'MRS. FATIMA ABDULAZEEZ', '1492', 7, 'abdulazeezfatima4@gsu.edu.ng', '07030313686', 15, 1, '2024-08-22 16:14:00', '2025-09-18 17:52:27'),
(5, 'MRS. ZULAIKHA LAMIDO ABUBAKAR', '1500', 8, 'zulaikhalamido@gsu.edu.ng', '08031121281', 14, 1, '2024-08-22 11:58:35', '2025-09-18 17:45:11'),
(24, 'MRS. SADIYA ABDULKARIM KWAMI', '1506', 7, 'sadhal@gsu.edu.ng', '08061308093', 15, 1, '2024-08-22 16:10:03', '2026-01-25 18:08:07'),
(6, 'DR. ONWUKA MARTINS IKECHUKWU', '1511', 5, 'martinso@gsu.edu.ng', '08142995051', 14, 1, '2024-08-22 12:12:27', '2025-09-18 17:45:35'),
(40, 'MRS. HADIZA UMAR YUSUF', '1685', 8, 'hadizaumaryusuf9@gmail.com', '07039378420', 13, 1, '2025-09-14 08:55:18', '2025-09-18 17:38:51'),
(45, 'MRS. AISHATU ADAMU', '1693', 7, 'amnah4real@gmail.com', '08089939307', 14, 1, '2025-09-14 15:39:36', '2025-09-18 17:45:51'),
(46, 'MR. ABUBAKAR USMAN', '1697', 7, 'abubakarusman696@gmail.com', '08039768729', 15, 1, '2025-09-14 15:44:24', '2025-09-18 17:53:12'),
(44, 'MRS. AISHA ZUBAIR UMAR', 'F1419', 7, 'aishazubairumar89@gmail.com', '08036924403', 14, 1, '2025-09-14 10:21:32', '2025-09-18 17:46:17'),
(39, 'BASHIR HASSAN', 'P1053333', 6, 'bashhassan2020@gmail.com', '08061689497', 1, 1, '2025-08-28 20:20:51', NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `tbl_tp_supervisors`
--
ALTER TABLE `tbl_tp_supervisors`
  ADD PRIMARY KEY (`fileno`),
  ADD KEY `id` (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `tbl_tp_supervisors`
--
ALTER TABLE `tbl_tp_supervisors`
  MODIFY `id` int(7) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=47;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
