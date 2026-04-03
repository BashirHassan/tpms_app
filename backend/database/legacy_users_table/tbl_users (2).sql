-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Apr 03, 2026 at 02:41 PM
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
-- Table structure for table `tbl_users`
--

CREATE TABLE `tbl_users` (
  `id` int(7) NOT NULL,
  `user_id` int(5) NOT NULL,
  `fullname` varchar(50) NOT NULL,
  `email` varchar(50) NOT NULL,
  `phone` varchar(15) NOT NULL,
  `role_id` varchar(5) NOT NULL,
  `password` varchar(250) NOT NULL,
  `status` int(5) NOT NULL,
  `date_registered` datetime NOT NULL DEFAULT current_timestamp(),
  `date_updated` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tbl_users`
--

INSERT INTO `tbl_users` (`id`, `user_id`, `fullname`, `email`, `phone`, `role_id`, `password`, `status`, `date_registered`, `date_updated`) VALUES
(28, 1, 'MRS. FATIMA ABDULAZEEZ', 'abdulazeezfatima4@gsu.edu.ng', '07030313686', '8', '$2y$10$JsWXURkgXrdhbENMZWzqs.vF4qNx2yYj/ktmfYDxwVH68yBUVMG1m', 1, '2024-08-22 16:14:00', '2025-09-22 04:12:39'),
(52, 18, 'MR. ABUBAKAR USMAN', 'abubakarusman696@gmail.com', '08039768729', '8', '$2y$10$8O6IKv0GjwMeA5wKafodPO5JiZ0wiO..zL9NBbUzfLuUoO.FhN5aO', 1, '2025-09-14 15:44:24', '2025-09-16 09:00:20'),
(24, 1, 'MRS. AISHATU ABDULKARIM', 'aishatkwami@gsu.edu.ng', '07067177049', '8', '$2y$10$BhQfLvlA6SimJ9SxK37nsOw16MNFx8WZQVuJLBpE5DR.j3GWjEn7i', 1, '2024-08-22 16:09:13', '2026-01-25 17:58:01'),
(5, 1, 'AISHATU ABUBAKAR TONGO', 'aishatuabubakaraa@gmail.com', '07037444818', '8', '$2y$10$F60C0CQuarybx2NxQkbE/emdtzKrdwj259PwlVE1J9spRx.wbv4k2', 1, '2024-08-22 11:56:30', '2025-09-23 11:15:40'),
(14, 1, 'AISHATU MOHAMMED HAMMA', 'aishatuh@gsu.edu.ng', '07030752831', '8', '$2y$10$smaPf2cSXBIOwvJHonYBbes1xD1MFxE5ghFVWrYZadVS53V.c9nSC', 1, '2024-08-22 12:25:15', '2026-01-26 15:25:05'),
(50, 18, 'MRS. AISHA ZUBAIR UMAR', 'aishazubairumar89@gmail.com', '08036924403', '8', '$2y$10$4VFofele3KMoXH0pqN.FqOxTvTipD6mngV/Hh3fsfvfrEgN5Fzrau', 1, '2025-09-14 10:21:32', '2025-11-18 14:26:27'),
(48, 18, 'MRS. AISHA ZUBAIR UMAR', 'aishazubairumar@gmail.com', '08036924403', '8', '$2y$10$kQ/KVs/QCAnlLB.QwTSSyuagvXngoQpDE4fM8mIHPvPW06svh0M.i', 1, '2025-09-14 09:04:16', NULL),
(49, 18, 'MR. AL-AMIN MOHAMMED', 'alameenalfira@gmail.com', '08039511789', '8', '$2y$10$hoiGiUKAkDJEagTUSeVVa.bCPX6/jKhAVSkc9iHApucrGNfB8uKHu', 1, '2025-09-14 09:41:57', NULL),
(33, 1, 'DR. JARUMI TIMOTHY ALIYU', 'aliyu1958@gmail.com', '08139774867', '8', '$2y$10$dao.IUUn28z8qvZTi764sujtRE2vyqUTcRCD5dQ2utG44maxCHWNq', 1, '2024-08-28 10:41:55', NULL),
(51, 18, 'MRS. AISHATU ADAMU', 'amnah4real@gmail.com', '08089939307', '8', '$2y$10$MUvFfXrexBIT7iK0RII0.u0/szMYJaKFcRes1bohy06e3Wk6Jg9eG', 1, '2025-09-14 15:39:36', NULL),
(45, 1, 'BASHIR HASSAN', 'bashhassan2020@gmail.com', '08061689497', '5', '$2y$10$qE0WzRHEotoWu.92Nn1JROioSkHzkIQaFx1tXgTETmfx44jPs37U.', 1, '2025-08-28 20:20:51', '2025-08-28 20:21:27'),
(9, 1, 'BIBI MESHAK', 'bibimeshak78@gsu.edu.ng', '08065129297', '8', '$2y$10$2k4KGkJQovcgp5aDpMvcdu9onPxKZPYddph6kqXXJ256SzUxQNaHO', 1, '2024-08-22 12:21:05', NULL),
(29, 1, 'MR. IBRAHIM BOMALA ADAMU', 'bomalapresidor@yahoo.com', '08035957147', '8', '$2y$10$fAD.NHkvxr8IwCLiVQnI2ONYiDMJHgr3Z2sS5ydN.jDMl66SPXw1W', 1, '2024-08-22 16:18:06', '2025-11-15 10:33:14'),
(1, 1, 'SI Solutions', 'developer@gmail.com', '08061689497', '1', '$2y$10$UlHfJ40VGFmHq0EittSj7OH9zU9eiyepXeDH1q18vHw8NraosmB52', 1, '2022-01-13 10:26:20', '2023-07-28 18:06:17'),
(15, 1, 'HASSAN USMAN EL-RASHEED', 'elrasheedhassan@gsu.edu.ng', '08036070446', '8', '$2y$10$pcQ1a4hnDWy4rPtfcA8XbuBDV8c3EwnbeA3SQN0NWFi2f72DMs5am', 1, '2024-08-22 12:26:01', NULL),
(3, 1, 'ER PETER LUKA', 'erlucaser@gsu.edu.ng', '07033026055', '8', '$2y$10$LsjJPDMwU90DYoHnZLokH.J5jdpdSFznhaDvIsB/1xg/bnW3T1zh.', 1, '2024-08-22 11:51:39', NULL),
(17, 1, 'DR. ESROM TORO JOKTHAN', 'etjokthan@gmail.com', '08059148244', '8', '$2y$10$rk1UObRU2vGyxoqtvTJ54OGcFsaxc8FNchR0iuRhn/axgpt6RNIqm', 1, '2024-08-22 12:28:41', NULL),
(13, 1, 'ISA FATI  WAZIRI', 'fatimaisawaziri@gsu.edu.ng', '08036799731', '8', '$2y$10$lZutZJoH2OZbr5SnZ8xvBOuCEh1KH5dfxV/HnoLU7tkyMB/u7XDRG', 1, '2024-08-22 12:24:26', '2026-01-23 11:19:20'),
(16, 1, 'DR. HABIBA ISAH', 'habibaisah@gsu.edu.ng', '08033072041', '8', '$2y$10$TN/7qJoHwxQsw/UHsiB9yu/g5NpdOBF9lOEESIybhaU9QlyrG4Jdu', 1, '2024-08-22 12:27:13', NULL),
(35, 1, 'DR. HADIZA HUSSAINI', 'hadizah@gsu.edu.ng', '08069093529', '8', '$2y$10$ejxrSFXxXoCPtkxMJKI.tujBdKpXYf98abtA39gSwDXwMzOtIEria', 1, '2024-08-28 10:43:18', '2025-09-23 12:15:53'),
(46, 18, 'MRS. HADIZA UMAR YUSUF', 'hadizaumaryusuf9@gmail.com', '07039378420', '8', '$2y$10$yBJioDijn.tisp2u74P/tO7nTggqGYTCBzxKnS3/JIrUQcDRS2MHq', 1, '2025-09-14 08:55:18', NULL),
(30, 1, 'MRS. HAUWA MOHAMMED', 'hauwakumo20@gmail.com', '08062378776', '8', '$2y$10$bORCAy/bFKhT3/eIt033L.SjZ70QZbjSiqB/DuCDOw.4IRtK9wANe', 1, '2024-08-22 16:20:58', '2025-09-22 12:10:01'),
(27, 1, 'MR. IBRAHIM MOHAMMED', 'ibraheemy@gsu.edu.ng', '08030801914', '8', '$2y$10$H9PrlpGm43sMu6MluvI/Ku9krzNUFiBn4upd1r8uEE/0aCQcwIHJ2', 1, '2024-08-22 16:12:52', NULL),
(43, 1, 'DR. IBRAHIM BELLO', 'ibrahimbellogunduma@gsu.edu.ng', '08039627772', '5', '$2y$10$xjyHvpdH/.8si9smuJtSbe2Rnw43Ou2JBmW/orV5hTZdChgW5DMP6', 1, '2025-08-25 10:18:51', '2025-08-25 10:26:13'),
(23, 1, 'MR. DANJUMA SHEHU IBRAHIM', 'Idshehu0016@gsu.edu.ng', '08036316040', '8', '$2y$10$S8o9mKL1hYbeDdp22Z4fqe6bkP/Osozm.kc8pwFMq68qE8pyoldai', 1, '2024-08-22 16:07:52', NULL),
(34, 1, 'DR. JAMILA ABUBAKAR USMAN', 'jamilausman2012@gmail.com', '08069093529', '8', '$2y$10$GQ8M2xmF72FjT8QWRVZfgueLWQBC3q0IMHvjI4xGUVlvdyfcUCk/O', 1, '2024-08-28 10:42:35', '2025-11-19 09:08:45'),
(10, 1, 'JOEL DOGO', 'Joel@gsu.edu.ng', '08068411441', '8', '$2y$10$cTtWQYgBv4kq75Pk8SgvfeUmmBxT/RPs8ksb5xEHs00IlA90UN74O', 1, '2024-08-22 12:22:01', NULL),
(2, 1, 'DR. JUMMAI IBRAHIM SAGIR', 'jummaisagir@gsu.edu.ng', '08036933968', '8', '$2y$10$t6UGxrQnocAY.YVuiSEEZ.5BQ.aLYFG8/l3C18aTs1jaSEErvI9HS', 1, '2024-08-22 11:50:29', '2025-07-29 13:06:07'),
(41, 1, 'Abubakar Lamido', 'lamidoab12@gmail.com', '08134119230', '1', '$2y$10$aO.Km2cHDH78TulqY92lxePSSy7zl4D78/X59wK0px.gDsfwvg/cK', 1, '2024-09-09 20:53:11', '2024-09-09 20:55:52'),
(4, 1, 'MUSA ABUBAKAR MAIKAMBA', 'maikamba@gsu.edu.ng', '08029149361', '8', '$2y$10$HOmWcspZWEqS.aEhovGcrOznVybavTfbFsB2KEMvZsrbAOLsq3tP2', 1, '2024-08-22 11:54:50', NULL),
(47, 18, 'MRS. MARYAM UMAR BACCIJI', 'mairobacciji@gmail.com', '07061974720', '8', '$2y$10$EEz/wVNKpM0k.QWxgZ/f6eVPSn9qTx4oRkfLQYvhtNz8Inu.kY0Wi', 1, '2025-09-14 08:57:47', NULL),
(18, 1, 'ABUBAKAR MUHAMMED KOLE', 'makole@gsu.edu.ng', '08060847118', '6', '$2y$10$3iZb/T9pn.tK85TEDiCKQO4LQBFXV3lir9co9Mk19xUed5EvT.X76', 1, '2024-08-22 12:30:11', '2025-08-26 13:24:54'),
(7, 1, 'DR. ONWUKA MARTINS IKECHUKWU', 'martinso@gsu.edu.ng', '08142995051', '8', '$2y$10$K7cPSaQnJQOfmznwQyNXHOCaQTl8UaA.wHppceYI/gimamFCNyD1K', 1, '2024-08-22 12:12:27', '2026-01-05 12:05:30'),
(20, 1, 'PROF. MARY ERASMUS SULAI', 'mary.sulai@gsu.edu.ng', '08036867589', '8', '$2y$10$VedM3BZGCCN5mvjdc1yvR.OwPGEHp9fyFBSao1Op7e8gkVazJbibW', 1, '2024-08-22 15:58:18', '2026-01-19 14:59:13'),
(37, 2, 'PROF.M.G. DUKKU', 'mgurama@gsu.edu.ng', '08037037462', '8', '$2y$10$kV9qbJ4ZUVH1r7ErPcWuNeOIAN40CvwVpu/1OSCJ.CDREXJcbauD.', 1, '2024-08-28 11:36:57', NULL),
(21, 1, 'DR. MUHAMMAD  DAUDA  KALA', 'mkala5019@gsu.edu.ng', '08088765557', '8', '$2y$10$uL0HeP9dd2DkgVKR6uo7ZeK7HMkVxGcX8XSrvofWKpo1.V6sIexY2', 1, '2024-08-22 16:02:33', '2026-01-01 12:57:07'),
(26, 1, 'MR. MUKTAR UMAR ARDO', 'muktarumar.mu@gsu.edu.ng', '07066583830', '8', '$2y$10$eRNLSecjQF/CoYgFV7cc.OeUEb5ygRmPcTvxi90hONDq0GZOTpf.C', 1, '2024-08-22 16:11:21', '2024-09-04 10:57:57'),
(25, 1, 'MRS. SADIYA ABDULKARIM KWAMI', 'sadhal@gsu.edu.ng', '08061308093', '8', '$2y$10$F7m4bT3Ry96c3dXr/oWq5uaY3xzChN3r2po28OQVNMbyfnXzKiPye', 1, '2024-08-22 16:10:03', '2026-01-25 18:14:16'),
(8, 1, 'FATIMA BALA SANI', 'sani.fb@gsu.edu.ng', '08038895352', '8', '$2y$10$LX3prBZVYTLwzz4RPlOgLuu9AJqjHye6SHmZyBfmWAqX6TzEZEKxa', 1, '2024-08-22 12:14:00', '2026-01-23 00:26:00'),
(19, 1, 'PROF. ADEPOJU OLUWASANUMI ADEDIMEJI', 'sanudepoju@gsu.edu.com', '08138061908', '8', '$2y$10$wjIriZ7kFc5H33ZG8kPove8w2VfuS1u15c8HTRRaqP/BW1rMnqNo.', 1, '2024-08-22 15:56:12', NULL),
(31, 1, 'PROF. SANI AHMED YAUTA', 'sayauta@gsu.edu.ng', '08035939644', '8', '$2y$10$gvGmVvYxAD1wo3Jhx.507ePT020nV9nfCQps6c.MyfvY6EANOan7q', 1, '2024-08-22 19:31:04', NULL),
(32, 1, 'DR. CHARLES ZAURE SABE', 'scharleszaure@gsu.edu.ng', '08020869199', '8', '$2y$10$TSzjWY.brvX6lB5.dfTa/.6C09pCd3xW.9987jUnthAqHaU3uBxvm', 1, '2024-08-28 10:41:05', '2026-01-09 08:47:59'),
(12, 1, 'DR. SOLOMON GARBA', 'solomongarba@gsu.edu.ng', '08036082796', '8', '$2y$10$UnxlhAPcqhoUdUULjz/93Oexx88K4dnaIjA2n3fl/cFDSVC3I5Ole', 1, '2024-08-22 12:23:35', '2025-12-19 13:47:30'),
(36, 1, 'YUGUDA FAROUQ UMAR', 'ubyuguda@gsu.edu.ng', '08036723330', '8', '$2y$10$S0zCmeFaAsbHkFUTX68mruRgkABIwtgrMxgSfIiXkXX1v88Kz/5Vq', 1, '2024-08-28 10:44:06', '2026-01-08 14:29:39'),
(22, 1, 'DR. ZUBAIRU SULEIMAN', 'zubairusulain@gsu.edu.ng', '08034499774', '8', '$2y$10$P6.lV7y3RTcq2pPcbTdvEOlcY.vldKOeuJeODdzWuZSkDRn9S2r4i', 1, '2024-08-22 16:04:43', '2026-01-07 14:12:54'),
(6, 1, 'ZULAIKHA LAMIDO ABUBAKAR', 'zulaikhalamido@gsu.edu.ng', '08031121281', '8', '$2y$10$ifz/p1l1vKTp6r8WaWrSEOzlD6V/qwqqArOqqU9uVhU/DVKg34SxC', 1, '2024-08-22 11:58:35', '2025-10-30 13:51:46');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `tbl_users`
--
ALTER TABLE `tbl_users`
  ADD PRIMARY KEY (`email`),
  ADD KEY `id` (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `tbl_users`
--
ALTER TABLE `tbl_users`
  MODIFY `id` int(7) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=53;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
