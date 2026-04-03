-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Apr 03, 2026 at 02:39 PM
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
-- Database: `u440761987_fuk`
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
(63, 1, 'DR. LASISI ABASS AYODELE', 'abasstps97@yahoo.com', '09034403969', '8', '$2y$10$SoM9kOctsw/ZgOOcKlfOy.fbG0Cm7.OFp34Q6/okuOYTT47k6JIp2', 1, '2025-07-01 20:34:57', NULL),
(72, 1, 'MR. ABDULHAKEEM  SIDI UMAR', 'abbasidi4sumee@gmail.com', '08030401316', '8', '$2y$10$HlaLvJFSjK3hX2xEv9B19.ZQVW3GwiXgMGY8YRFB774rJic8ep2ry', 1, '2025-07-01 20:34:57', NULL),
(4, 1, 'PROF. ABDULHAMID AUWAL', 'abdulhamidauwal@fukashere.edu.ng', '08028712901', '8', '$2y$10$vgLWD1mz0RgvqXL7GYUGqOWtkHecRLUprC1UqqxtAUhgkpOER5rda', 1, '2025-06-09 14:33:38', '2025-07-04 13:05:39'),
(12, 1, 'DR. MOHAMMED ABDULLAHI', 'abdullahi.mhammad41@gmail.com', '07060422933', '8', '$2y$10$acMTMpb6VwK8m0pUvOj5LuTusPDIsXbx2xYhD9rNOhQZ/.K64JNuy', 1, '2025-06-09 14:33:39', '2025-09-23 18:49:41'),
(24, 1, 'MR. MOHAMMED ABDULLAHI', 'abdullahim376@gmail.com', '08065559786', '8', '$2y$10$i3ist65BrocIvycGunC5lOXyCoIf0tfSrv4ylFjZKx2evMIldeO/u', 1, '2025-06-09 14:33:40', '2025-09-07 17:54:46'),
(95, 1, 'Dr. YUNISA ABDULRAHMAN Y.', 'abdulyunisa@gmail.com', '08035659475', '8', '$2y$10$Orb4XOlsLSkUhhEXtIu15.HMDs08fhEzbQddD6KDecAaKZB73qnby', 1, '2025-07-02 13:36:45', '2025-10-07 07:42:50'),
(23, 1, 'MR .ISMA’IL ABDURRAZAK', 'abdurrazak.ismail@fukashere.edu.ng', '08161515025', '8', '$2y$10$SI5eVsbLpjnvGDG4uEbSxOEb.v9XPRPyCffdad5Sp71K6ZcF6rxgG', 1, '2025-06-09 14:33:40', '2025-06-24 15:21:09'),
(69, 1, 'MR. TSOHO ALIYU ABRAHAM', 'abrahamtsohoaliyu869@yahoo.com', '08032416254', '8', '$2y$10$.mUvhs5FTiXpAUr1kDWizOj/7GeA4A9mEQPLQ1fYaIUC5HfSi.vV2', 1, '2025-07-01 20:34:57', NULL),
(42, 2, 'ABUBAKAR MOHAMMED', 'abuamirandamira@gmail.com', '08146086818', '8', '$2y$10$ItWCzbnYG45uLZjt8zKGwO2SLWxV409tgNCQXlmNdUoEd0qA.cyB6', 1, '2025-06-24 11:14:07', '2025-06-24 11:27:09'),
(86, 1, 'MR. ABUBAKAR MUSA ABDULLAHI', 'abubakarmusaabdullahijalabi@gmail.com', '07069142520', '8', '$2y$10$QQzhX2U.3JFL4oez0dv4W.REBdi0PCj2QLFCyO4nRAIw0t6n1v0oS', 1, '2025-07-01 20:34:58', '2025-09-23 14:02:44'),
(83, 1, 'MR. USMAN SALEH MOHD', 'abutahira2011@yahoo.com', '08065105919', '8', '$2y$10$F/JZVYl7.gtgV9qlDc3f6u1hvKEEofmhO1G.q6.xJRJYaTaCqTsdO', 1, '2025-07-01 20:34:58', '2025-10-10 12:09:22'),
(14, 1, 'DR. BELLO AHMED', 'ahmadballow@gmail.com', '08035336420', '8', '$2y$10$tLpeGK4PBgRA5w5Gay7cKOxhraRbHPMdCqpVquG346tCc6qd.EA3e', 1, '2025-06-09 14:33:39', '2025-07-02 07:33:51'),
(107, 1, 'AHMAD GARBA', 'ahmadgarba315@gmail.com', '07030215179', '8', '$2y$10$m2zPtMmh1KLNZoDebhpT8eIZh8xkRNbHbBhNIXd9aG5EwVzwyQlXm', 1, '2025-07-02 13:36:45', '2025-10-03 07:06:30'),
(15, 1, 'DR. AHMED IBRAHIM', 'ahmadkt21@gmail.com', '08034176161', '8', '$2y$10$nFRHQhKAZLY73Rzjnew6Gett/rgv2N5wUwh4wE5AelLEWH0x/yfpS', 1, '2025-06-09 14:33:39', '2025-10-02 03:45:18'),
(114, 1, 'AHMED MUHAMMAD WAZIRI', 'ahmadwazirikumo@gmail.com', '080', '8', '$2y$10$/hi8ss5tj.cnyoKIv3ikY.LoYDls6uHu3iCb28ogs2k2NGGhR1WaK', 1, '2025-07-03 09:27:16', '2025-09-22 05:27:05'),
(98, 1, 'AHMED ABUBAKAR', 'ahminaad54@gmail.com', '08022889295', '8', '$2y$10$LlLOzAmoWgegViKKnqmqWeluK1nJalY7nT3Lu0rMPE/Ga2VernI1.', 1, '2025-07-02 13:36:45', NULL),
(109, 1, 'ALHAJI DANLADI', 'alhajidanladi8@gmail.com', '08036780770', '8', '$2y$10$vfXKN5BqQjdwao05Jy.lg.XVBo0qkm5OuKUEu2J28y/y.ajifANz.', 1, '2025-07-02 13:47:00', '2025-09-25 10:52:23'),
(92, 1, 'DR.ALIYU HASSAN DALHATU', 'aliyudalhatudull7779@gmail.com', '08066776610', '8', '$2y$10$Ks/QW7gcIZR6BgslwHZF7.B.beI5HA6RJtQXA3O/ZfOA.v/1AGnAW', 1, '2025-07-02 13:36:45', NULL),
(105, 1, 'AMINA ALIYU AJI', 'aminaaji5@gmail.com', '07039566898', '8', '$2y$10$DVqBBOa1uM1AykL5fSMKsO80hTJXge5DmMv/mGRdg4ScLPimr711K', 1, '2025-07-02 13:36:45', NULL),
(76, 1, 'MR. AHMED SADIQ', 'asadiqbara@gmail.com', '08063078585', '8', '$2y$10$OmI.l3vzm8qG2VXGyAGnSupSBrzKk/saCvPOCnMo3Sfm9m54.xTtG', 1, '2025-07-01 20:34:57', NULL),
(28, 1, 'MR. AYUBA BALA', 'balaayuba1@gmail.com', '08063755678', '8', '$2y$10$jumLJHyQ5Wb5to7nJvgJ.uE2fvZ5mAlDskzRYldJDCKG9sfWedg0m', 1, '2025-06-09 14:33:40', '2025-07-03 06:41:52'),
(78, 1, 'MR. MUHD BALA HASHIDU', 'balahashidu@gmail.com', '08022651871', '8', '$2y$10$Kr/MeqEPaMAEUwW/UMbbeOeaT9n2EuloQ6Cvsvzcv9st04wxy7dTi', 1, '2025-07-01 20:34:57', '2025-09-21 21:42:11'),
(56, 1, 'PROF. BARAKATU ABDULLAHI', 'barakatuay@gmail.com', '08034476765', '8', '$2y$10$k/3OgoAWWBzfq4p4iqWjf.uRh5NvPDb37WuefXLyKs2hFK9zHncZ2', 1, '2025-07-01 20:34:56', NULL),
(102, 1, 'BABANI BARDE', 'bardebabani@gmail.com', '08066951197', '8', '$2y$10$8fvCHpwFp97dUxM4PqIy1.oU.QC98sjLjDXnaRJexe4vYvZg/6xKi', 1, '2025-07-02 13:36:45', '2025-09-22 13:15:11'),
(39, 1, 'MR. SA’IDU ADAMU BELLO', 'bashhassan202037@gmail.com', '07035632244', '8', '$2y$10$Jg6n0wVdXWXX0hGgy8AfGuP96Hrr8KBdiEKGZz622NQi1wEZTaQXa', 1, '2025-06-09 14:33:40', NULL),
(5, 1, 'PROF. AHMED TAJUDEEN SHITTU', 'bashhassan20203@gmail.com', '08162182220', '8', '$2y$10$HkgPMPvAulJcfqj4Yl1ON..GMBzebGuIEwt.D9oWdwDyw3Y5LlOP6', 1, '2025-06-09 14:33:39', NULL),
(6, 1, 'DR. TUKUR MADU YEMI', 'bashhassan20204@gmail.com', '08066289200', '8', '$2y$10$YbUkQNnnpblVNctbbmZUIO0GXQktL.Rnpca57iTOlv1e11mt64vY2', 1, '2025-06-09 14:33:39', NULL),
(113, 1, 'BASHIR TUKUR ADAMU', 'bashirtukuradamu@gmail.com', '08031169423', '8', '$2y$10$rTKiRQ1wiicMMiyT28ROo.JjMQtBTf4qXz4nu0xM1vM0tMUNW4WCa', 1, '2025-07-03 08:45:39', '2025-09-24 16:12:28'),
(53, 1, 'DR. BASHIR ABDULLAHI', 'basirabdullahi305@gmail.com', '08064490953', '8', '$2y$10$Ak6rIAQEM4H8MuSU4WI3H.bvkmOrLl6NoKhiUKjw9Fxg.mnEaoiPC', 1, '2025-07-01 20:34:56', NULL),
(103, 1, 'IBRAHIM BAWA', 'bawaibrahim166@gmail.com', '08063051935', '8', '$2y$10$V0RWIGHBSRmOrcXIWPud5uDznplloydds5bnkk9NPFAMdr2CH7CQi', 1, '2025-07-02 13:36:45', '2025-09-23 10:51:46'),
(91, 1, 'BELLO ABDULKADIR', 'belkadir65@gmail.com', '08065469834', '8', '$2y$10$wZQlnUyGM.mHaVKqNr2Z/un1eBcI61fdA7.yNpno/B9cLSVFAaV8i', 1, '2025-07-01 20:34:58', '2025-10-09 20:38:31'),
(36, 1, 'MR. MUHAMMED IBRAHIM ABBA', 'bonga2004@hotmail.com', '08067948703', '8', '$2y$10$/gv23rub8BJ0bKfFbMjQQeOOOh14f8CEPHx9ujj1BnVnuNmPq3Dry', 1, '2025-06-09 14:33:40', '2025-08-01 11:06:25'),
(31, 1, 'MR. CHRISTOPHER YOHANNA', 'chriscymc@gmail.com', '08037751572', '8', '$2y$10$Rkm3/NObMS9/BLOteH6WSudGppphtmZQZMa4LhXvGRGDJBB7Erczq', 1, '2025-06-09 14:33:40', '2025-07-25 08:52:50'),
(65, 1, 'DR. CLEMENT IGBAJI', 'clementigbaji@gmail.com', '08032076249', '8', '$2y$10$THjMhuHvINTYMDsTIAtk1uG2/jmubZiH2gG4RFFxFh0mtxA.Zn1m.', 1, '2025-07-01 20:34:57', NULL),
(99, 1, 'DAHIRU ALIYU', 'dahirualiyu02@gmail.com', '08166921921', '8', '$2y$10$EZ5N6quGzW.RkxJGuQ7kxOvjoKVCvLDbLbFg.OrHqUuCA76kLTUla', 1, '2025-07-02 13:36:45', '2025-09-17 18:22:06'),
(71, 1, 'DR. GARBA SULEIMAN DANMAITABA', 'danmaitabag@gmail.com', '07061346602', '5', '$2y$10$XSgr4/J3XT3fafy0cguYweFPbk7sZUSxX7wDHyp6/B9DqfdfOyjd2', 1, '2025-07-01 20:34:57', '2025-07-29 22:13:19'),
(11, 1, 'DR. DAUDA MUHAMMED', 'dawudbnmuhammad@gmail.com', '08036286850', '8', '$2y$10$P78pRo3nQgQ57wOHiaRmduEDZzBiVKr/NO4YugF3AYGrCO9x6XFWq', 1, '2025-06-09 14:33:39', '2025-09-23 14:18:00'),
(19, 1, 'MR. EZEKIEL DAZI PAM', 'daziezekiel@gmail.com', '08037668529', '8', '$2y$10$bXP.eyKb2ICcCRMW.Yi6dOmDRvU82dWdlnAY7vDF9LTpw7snp.EtS', 1, '2025-06-09 14:33:39', '2025-08-01 14:19:42'),
(1, 1, 'SI Solutions', 'developer@gmail.com', '08061689497', '1', '$2y$10$UlHfJ40VGFmHq0EittSj7OH9zU9eiyepXeDH1q18vHw8NraosmB52', 1, '2022-01-13 10:26:20', '2023-07-28 18:06:17'),
(88, 1, 'DR. DIANA INUSA', 'dianainusatermana@gmail.com', '08034031654', '8', '$2y$10$Fb6wcsEqgsj/yamO3LMRBuQrhldaumQ0cwFkaoFIsYDBDkL4RatKe', 1, '2025-07-01 20:34:58', NULL),
(60, 1, 'DR. YAKUBU SALIHU MUHAMMAD', 'docsamyak14@gmail.com', '08130009317', '8', '$2y$10$jzUUj/Krml33oivAPh0np.NSNlpiJpAt2Mfl9f9OqwdkMCFi328NG', 1, '2025-07-01 20:34:56', '2025-07-03 09:23:14'),
(119, 71, 'PETER DOGO', 'dogopeter083@gmail.com', '07087284916', '8', '$2y$10$QU6QyyH9HIGSb4mOj969guJ7/i2siilEdVGT8E7J9V2InDhTK5FK.', 1, '2025-09-23 13:18:41', NULL),
(84, 1, 'MRS. DORCAS BAKARI', 'dorcas.bakari@gmail.com', '07032690288', '8', '$2y$10$3gk7Vi2co273sV/sfJBJ3Oqp89zbWZD2DKDKtq1rHuEGTRfF/538a', 1, '2025-07-01 20:34:58', NULL),
(61, 1, 'DR  GAMBO ADAMU ALIYU', 'gamboadamualiyu@gmail.com', '08034540932', '8', '$2y$10$PvBvyAq.G0D0FEM0yTgOeeaWRFtz/fvxi2uy046Lsz5Lm9dMHvzo6', 1, '2025-07-01 20:34:56', NULL),
(79, 1, 'DR. IGBANGI NATHANIEL', 'gberkyon@gmail.com', '07067129331', '8', '$2y$10$j4/yWBlqGjTpuHi7z1piUu3IcVicdvpGkqvOgCI50F/s7Rbnddfy6', 1, '2025-07-01 20:34:57', NULL),
(77, 1, 'DR. DUNGUN GODFREY RIKAT', 'grdungum@gmail.com', '08065557195', '8', '$2y$10$L2Y54PXawTLFHxApOVO9ie1sR84OmS7CRlV/mknXRb6LaPA5ctdbi', 1, '2025-07-01 20:34:57', '2025-10-20 02:18:07'),
(20, 1, 'MR. BAMUSA KWAMI HABU', 'habuhabu6@gmail.com', '08032854171', '8', '$2y$10$P57N56pAI7NayMOwYH4oh.jixJuDvm.bf0sSroh8TXdMUKX06miWy', 1, '2025-06-09 14:33:39', '2025-09-22 23:38:20'),
(73, 1, 'MR. HAMZA MUSA ABUBAKAR', 'hamzamusaabubakar@gmail.com', '08031554182', '8', '$2y$10$ie62hKJX3SH3jfylvDk.v.LbrarxUVFAM39k/7WxNtBRIbvrD3X0K', 1, '2025-07-01 20:34:57', '2025-08-01 01:47:52'),
(27, 1, 'MR. HARUNA IBRAHIM ALIYU', 'harunaialiyu@gmail.com', '08030415176', '8', '$2y$10$PriNG9qhN3WxBePLcJns7uukjnSbJ6tUjKWBV5omkI05vaPh/hu7G', 1, '2025-06-09 14:33:40', '2025-06-28 21:45:22'),
(68, 1, 'DR HAUWA A. MOHD', 'hauwaabdullahimuhamad@gmail.com', '08033544790', '8', '$2y$10$nIBYz5ffsnDG7ag4TAtofuGWdd4dsncfE./QbjgdyF7q5rdqD/Ct.', 1, '2025-07-01 20:34:57', NULL),
(22, 1, 'MR. IBRAHIM ABUBAKAR', 'ibrahimbogo@gmail.com', '08065075864', '8', '$2y$10$p7fea3hohqOMT5yU8Ufa9.d5nUdV./JwbmVe1Rb/7ofn0LdLrQ8E.', 1, '2025-06-09 14:33:39', '2025-09-22 05:32:36'),
(67, 1, 'DR. ISAH JIBRIN', 'ijibrin143@gmail.com', '08032729732', '8', '$2y$10$B2cSjbSgyEpX/oTbxgBDt.giUpUlFkRwWWFyDr3nUo49UesNyAkk6', 1, '2025-07-01 20:34:57', '2025-07-03 09:16:01'),
(55, 1, 'PROF. ISAAC ADAMU MSHELIZA', 'isaacmsheliza@gmail.com', '08065355171', '8', '$2y$10$amlEhZ3KIuZIMRuAUGWAou3tuxmoFipTISNj2p2LZbS7O4kTq7/Nm', 1, '2025-07-01 20:34:56', NULL),
(115, 1, 'DR. ISAH ABDULKARIM TILDE', 'isahatilde@gmail.com', '080', '8', '$2y$10$gtjuPuQPeLCGEMHO/SfzNuhr2dAg8PgAf1vZvnlKfssyIg96sZzl.', 1, '2025-07-03 09:45:51', '2025-09-22 09:36:10'),
(41, 1, 'DR. BAWA JOHN', 'jbawa891@gmail.com', '08034016897', '8', '$2y$10$PzcJcy2GhDYmaXt6lq62L.IhkUrfEU407s6DkuGCG109P4c8VR9Dm', 1, '2025-06-24 10:57:26', '2025-08-03 07:53:50'),
(33, 1, 'MR. MAILAYA JOJI MASOYI', 'jojimasoyi@gmail.com', '07061393074', '8', '$2y$10$oH327Ta3KMogRRgMbDfW5.ToBJoq4mtBJvUGdytqlKPrCAZ9Sfioe', 1, '2025-06-09 14:33:40', '2025-09-06 10:40:39'),
(18, 1, 'MR. JOSEPH MANU', 'josephmanu9177@gmail.com', '08062573497', '8', '$2y$10$/.8S2A3j9BB3UZyUFmy33eqHgl2O9aL1aiGBORZ9mK6XftFdYMUKG', 1, '2025-06-09 14:33:39', '2025-09-18 18:23:10'),
(34, 1, 'MR. ADAMU JOSHUA', 'joshualamika123@gmail.com', '07035115113', '8', '$2y$10$DiiUcsVTUwvjMt3X2LhMeec/paDi6zFu8IsZnW/xS1dTe2tfRPHZS', 1, '2025-06-09 14:33:40', '2025-08-05 11:04:03'),
(74, 1, 'MR. MUSA MOHAMMED', 'kallam934@gmail.com', '07035981261', '8', '$2y$10$fzdokOmJGhKRVeqdEbDMHOID.32NPavaQaDIQ7NZHhu.rJgGWi8ti', 1, '2025-07-01 20:34:57', NULL),
(66, 1, 'DR. OYEWUMI KASSIM A.', 'kaoyewumi@gmail.com', '08038038958', '8', '$2y$10$CRpqhmG49qQKLtMyXUjua.xXnMIYTxK51rZdInM2iDaUcKknpA/2K', 1, '2025-07-01 20:34:57', '2025-09-23 18:30:23'),
(25, 1, 'MRS. BENETH CHETACHUKU KEZIAH', 'keziahben2016@gmail.com', '07066022199', '8', '$2y$10$AjJS1jtPWpNTJ15YXPWZ7ullTm0P7x5VyqcywJtKeWmzQBctW1Zeq', 1, '2025-06-09 14:33:40', '2025-07-03 09:00:30'),
(21, 1, 'MR. KUNTA DANYO', 'kuntadanyo1@gmail.com', '08039207630', '8', '$2y$10$0LxTf5En1hgIJKlQzHPJ1ONtUZMakaF2MJUe6aZ.PEpQd0NDRb0uG', 1, '2025-06-09 14:33:39', '2025-09-01 12:50:07'),
(7, 1, 'DR. ONIPEDE OMOLEYE', 'leyniped@gmail.com', '08066767931', '8', '$2y$10$7KUUadD3Nz5ECznlCmy8aObuDqoe9VdUSyZXIB3PojaawMKaWhQl2', 1, '2025-06-09 14:33:39', '2025-10-02 03:39:06'),
(81, 1, 'MR. IBRAHIM LUKMAN JAHUN', 'ljahun555@yahoo.com', '07031202728', '8', '$2y$10$4Tm2gxjD8tSTKRn6JL.H9.ZtG5YBbCDfJNS3DhOFumZPCBMwJt1S2', 1, '2025-07-01 20:34:58', NULL),
(110, 1, 'UMAR ALI MAGAJI', 'magajiumar76@gmail.com', '080', '8', '$2y$10$owBNZig2xF2QMQDMrqEYN.iLx1gwVGZ1G1bBWympE2b9OlITMO28e', 1, '2025-07-02 13:52:11', '2025-08-01 08:22:37'),
(82, 1, 'MRS FATIMA UMAR', 'marafandeba@gmail.com', '08065848491', '8', '$2y$10$tjx9kKeVT2jMXFjZFIHJde7rc6L4B3rea0arGPLurU5ylFpLqq046', 1, '2025-07-01 20:34:58', NULL),
(30, 1, 'MRS. ADAM MARYAM UMAR', 'maryamumaradam3841@gmail.com', '08066113514', '8', '$2y$10$OeNK6HHoDAJirRjVthq6g.kBHmw4Ed8Dau510buOuhTcgizfMwrBS', 1, '2025-06-09 14:33:40', '2025-06-24 12:03:26'),
(32, 1, 'MR. MELA I. LAPPI', 'melailulappi@gmail.com', '08067517178', '8', '$2y$10$tWeekcuekAnf32qjPR4MyOQGxsCQhmSoHXetRUNvne9oSECUM2voa', 1, '2025-06-09 14:33:40', '2025-08-16 00:44:52'),
(43, 1, 'MUHAMMAD SALLAU MUHAMMAD', 'muhammadsallaumuhammad@gmail.com', '08036818429', '8', '$2y$10$DLRsoN3hQBdKZ1LjqE.Kyu4PS6AM4OjXvaAaD1ajZ.bez/H4moMA.', 1, '2025-06-24 11:43:32', '2025-10-06 13:17:14'),
(13, 1, 'DR. MUHAMMAD BELLO', 'muhdbello087@gmail.com', '08035873653', '8', '$2y$10$/qC1oxnxloTjapXevxMESuyJkpcfDQQ1.mgT9vgWpjUUVE.OmyAky', 1, '2025-06-09 14:33:39', '2025-10-07 11:39:47'),
(58, 1, 'DR. MUSA ADAMU MSHELIA', 'musaadamumshelia@gmail.com', '08036659531', '8', '$2y$10$ALwI8.Bx.5ZlyWY583AmIuoBhyCrk/P4fUYeiMSoWB3H9Tdjxj3iC', 1, '2025-07-01 20:34:56', NULL),
(104, 1, 'MUSA A. BABAYO', 'musawalah@gmail.com', '08036763809', '8', '$2y$10$ifFjiwb/nFiuN1o3F0GJuO.QGhFp4VXxySfTRsRtuHfolIGJqifG6', 1, '2025-07-02 13:36:45', NULL),
(97, 1, 'MUSTAPHA SALEH', 'mustaphasaleh1990@gmail.com', '07039271752', '8', '$2y$10$g4FYA2YxpoiPzMQmPFwTvep9tHSAh4962OQnLec1DntrTfe3PxJre', 1, '2025-07-02 13:36:45', NULL),
(64, 1, 'DR. ALABI MUTIU AYOFE', 'mutiualabi4m53@yahoo.com', '08106231595', '8', '$2y$10$IiUd7lgz81QwUxh2MqXg6.T.7fMkIhte8q/D0ZWzZ4rKJSeHi7U6u', 1, '2025-07-01 20:34:57', NULL),
(37, 1, 'MR.ALIYU NASIRU TAMBUWAL', 'nasirtamb@gmail.com', '08065199579', '8', '$2y$10$MACEUb.5uiXzIQpZYTulPuykzRljCU9TwkFu2/NNqtiJ2jDjI7eGS', 1, '2025-06-09 14:33:40', '2025-07-03 06:51:09'),
(54, 1, 'PROF. SALISU ALI RAKUM', 'njaujau@yahoo.com', '08025475896', '8', '$2y$10$wsGOpYTnan/.1n6Gq5mw3.HuEm2XVv6nqz54aeonUTBjU/hhUySFO', 1, '2025-07-01 20:34:56', NULL),
(118, 71, 'NURA ALHAJI', 'nuraalhaji2021@gmail.com', '08032492757', '8', '$2y$10$VOQx2uo8XmtHtGgJwvtTIe7..cAdGjUOcioC6ipi.Xn6ddb74nAXu', 1, '2025-09-23 10:33:39', '2025-10-07 08:55:15'),
(62, 1, 'DR. NYITSE MARK', 'nyitsemark@gmail.com', '08069483310', '8', '$2y$10$8s.n4VVMLV9fPpooVhpb8ef5x63ZrR1oh3BDPFR6gLWRKkcTNGjvG', 1, '2025-07-01 20:34:57', NULL),
(75, 1, 'MRS. RUWAYDAH A. BELLO', 'ruwaydahbello@gmail.com', '08031853147', '8', '$2y$10$ehzEDFeufATBZe.MkOQPteK.gbdSfq9q2qwoOofnVJ9Tlz00sVyIS', 1, '2025-07-01 20:34:57', '2025-09-22 09:51:36'),
(96, 1, 'ABUBAKAR ABDULKADIR A.', 'sadeeqabu8@gmail.com', '08038042138', '8', '$2y$10$SKNmslbpHjrgQEgfmkmFUuNvuikUigX5cD0TV5Hvu5EZNrgjBfNvW', 1, '2025-07-02 13:36:45', '2025-09-22 05:56:15'),
(10, 1, 'DR. ISA SAGIRU', 'sagiru5604@gmail.com', '08033552886', '8', '$2y$10$7bWOMaZ5elaBgeGleusl/OXPCHSN7SLVpfu05sTTpM4CmiGaBT69O', 1, '2025-06-09 14:33:39', '2025-10-02 03:43:16'),
(112, 1, 'DR SALISU MUSA SANI', 'salisumusasani600@gmail.com', '080', '8', '$2y$10$6MKmg0VwKSHHBkUnf6XdfeMuGSUHrYmFoAw2QN9vgNNrC48TpDI16', 1, '2025-07-03 07:00:03', '2025-09-22 18:37:50'),
(8, 1, 'DR. OGUNDARE SAMUEL AKINOLA', 'samogundare91@gmail.com', '08035808537', '8', '$2y$10$H496oNjfHQB3Nh.5pMCky.7SSjVZf6pyU0WIfTEZttUoMS2iff8o6', 1, '2025-06-09 14:33:39', '2025-10-02 03:40:48'),
(59, 1, 'DR. SAMUEL ALFAYO BOH', 'samuelalfayoboh02@gmail.com', '07037810409', '8', '$2y$10$CjuczEGmQ8L4a/U2gKkfguItmpAxOIVSKfYNrFoPh2Gf4O9hEFMYG', 1, '2025-07-01 20:34:56', NULL),
(29, 1, 'MRS. SAMUEL MARY', 'samuelmary792@gmail.com', '08038204057', '8', '$2y$10$ql7xeKhwFpcx4SOF8OprWexpDwfo0rPq3n428uiER8KCVilXKM.Sq', 1, '2025-06-09 14:33:40', '2025-09-22 12:07:40'),
(106, 1, 'ABDULRAUF SANI', 'saniabulrauf@gmail.com', '08064956294', '8', '$2y$10$/G7kabmC.hkZLwqXfg9.6.BNpZ51qm60TYvW39LaJ9iXA82unu5Xq', 1, '2025-07-02 13:36:45', NULL),
(90, 1, 'SANUSI HARUNA MOHAMMED', 'sanusiharunamuhammad123@gmail.com', '08037327044', '8', '$2y$10$wSeIf02NAIhQtUOy/KZuruIMWta2Lz0MaMi.YCD/Cc25jEBDd8SxC', 1, '2025-07-01 20:34:58', '2025-09-22 06:49:04'),
(38, 1, 'MR. USMAN IDRIS', 'shehu100@gmail.com', '08038891436', '8', '$2y$10$zKO1XNT8wJDjz2VjC1byiOlIJtRRDN4WxBJf7bisxPGvBDh6m4cfS', 1, '2025-06-09 14:33:40', '2025-07-02 13:21:56'),
(100, 1, 'INUWA SHEHU YUSUF', 'shehuayusuffa@yahoo.com', '08066757165', '8', '$2y$10$S/APe6sCBoxBn9RguN6yFOfpwkzfar3prwGA7OlG8vXLPt9y81Ye2', 1, '2025-07-02 13:36:45', NULL),
(108, 1, 'SHUAIBU IBRAHIM', 'shuaibuibrahim210@gmail.com', '08034513295', '8', '$2y$10$N.Fr8bzXxOx/w8ZT8DDfnuqtWgHfej97h1YEV9E1z0xUv.noypH.6', 1, '2025-07-02 13:36:46', NULL),
(93, 1, 'PROF. UMARU SHUAIBU', 'shuaibumaru@gmail.com', '07064325551', '8', '$2y$10$Id8Wx6OVS3uFUyyeEKVgzu4NITQQaNOnKIlM3MXwMoKGcqzK3By1G', 1, '2025-07-02 13:36:45', NULL),
(3, 1, 'PROF. SOFEME REUBEN JEBSON', 'sofemejebson@yahoo.com', '07088846022', '8', '$2y$10$ap.Go.D15N3RiCCUBGUZYuLyd29PWh3qbPXo/3i6On6yfgQQs04h6', 1, '2025-06-09 14:33:38', '2025-07-04 12:03:45'),
(9, 1, 'DR. TYOOR IORSUGH TITUS', 'tyooriorsughtitus@gmail.com', '08036431366', '8', '$2y$10$gPTE1oWvmfDTTx53TQtjueuLDrFygh9Bn0k0vc7AYp65rvH6ztk5e', 1, '2025-06-09 14:33:39', '2025-10-01 08:08:43'),
(40, 1, 'UMAR MAGAJI ABUBAKAR', 'umarmagajia@gmail.com', '08030529940', '8', '$2y$10$.QlEydayJk1OJFfjje6x5.pLcrnFCGc0arCekSO3QK/xr4DE3/3HK', 1, '2025-06-24 10:50:41', '2025-07-02 18:37:51'),
(17, 1, 'DR. SANI ALHAJI UMAR ', 'umarsani365@gmail.com', '08036556222', '8', '$2y$10$zSLDs0Y3icvwuA3jL5h.9.pImGM1f/rHfTWVS7Q2mWFoAPson.2BG', 1, '2025-06-09 14:33:39', '2025-09-26 20:36:29'),
(116, 1, 'USMAN ADAMU ALKALI', 'usmanadamualkali@gmail.com', '080', '8', '$2y$10$cVIhQxVETpFUtBCQabv9Me51ebbeygjqs49SNT.ygfsTKt5nY7Xf6', 1, '2025-07-03 09:48:23', '2025-07-03 12:53:06'),
(111, 1, 'DR. VINCENT YOHANNA IWAH', 'vincentiwah@gmail.com', '07068078015', '8', '$2y$10$seDmoghgenECuz8TCnFKyeL3yCIKchLtnXB9ax3eADsSviSHiQBDK', 1, '2025-07-03 06:54:46', '2025-09-17 11:07:45'),
(35, 1, 'MR. YAHUZA ADAMU', 'yahuzaadam23@gmail.com', '08031107804', '8', '$2y$10$qEXVTITsCd5HZf8w2Mjy6eJbQzt/P9zD1LfyfQHSxmOAgzFhcK/.u', 1, '2025-06-09 14:33:40', '2025-07-03 09:05:25'),
(87, 1, 'MR. YAHUZA BIWAI', 'yahuzabiwai@yahoo.com', '08029629701', '8', '$2y$10$ZiQ5POspYf/87EDP41UL4.ak/fa0uOH1Q/xoFxAc1KcbzMPvTJ1cC', 1, '2025-07-01 20:34:58', NULL),
(57, 1, 'DR. IBRAHIM YAKUBU WUNTI', 'yakubuibrahimwunti@gmail.com', '08036413988', '8', '$2y$10$uahLnxfwUSWvt33VYOukOOCTYDhb.dGMXZrZvJ4QwLdsxsaCtdPVe', 1, '2025-07-01 20:34:56', '2025-07-03 06:53:18'),
(16, 1, 'DR. DANIEL HYELYANKURI', 'yankuri1@yahoo.com', '08027993733', '8', '$2y$10$dp2nyT9ohMGZgxVNRPUuo.IRAnmoDOwduxWFb4t1eHeAWtZr/OCzi', 1, '2025-06-09 14:33:39', '2025-09-25 22:42:41'),
(80, 1, 'MR. YAZID DAHIRU', 'yaziddahiru222@gmail.com', '08036306145', '8', '$2y$10$qBTmFbMUDvzlGj08SuZSM.6uKBsEPfohi3D9zrrUWIw1RIpZADmIe', 1, '2025-07-01 20:34:58', NULL),
(117, 1, 'ZAHRA\'U YUSUF MUHAMMAD BABA', 'zahrababa1987@gmail.com', '08036535698', '8', '$2y$10$0lm1fMm4ZRabo8hicU2NMeFEK78OgLn3GzI1q8bcethG14WqGv5X2', 1, '2025-07-04 11:59:50', '2025-08-01 11:07:50'),
(94, 1, 'DR. MUKHTAR AMINU ZAITAWA', 'zaitawy35@gmail.com', '07033026696', '8', '$2y$10$21HzUSwrodz9dVaEMjOXt.dRXL1yM97igzAHd5s4MAoa4r1C6dWdy', 1, '2025-07-02 13:36:45', NULL),
(26, 1, 'MRS. SAMA’ILA D. ZULAI', 'zulaisamaila@yahoo.com', '07069559551', '8', '$2y$10$8qxNTMEz/4o0pWyv14rFJuqzz6.PbKlJOuLkLVbD8ZdPHWN08Jsaq', 1, '2025-06-09 14:33:40', '2025-09-23 10:50:14');

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
  MODIFY `id` int(7) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=120;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
