-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Apr 03, 2026 at 03:37 PM
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
  `monitor` int(11) NOT NULL DEFAULT 0,
  `status` int(5) NOT NULL,
  `date_created` datetime NOT NULL DEFAULT current_timestamp(),
  `date_updated` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tbl_tp_supervisors`
--

INSERT INTO `tbl_tp_supervisors` (`id`, `fullname`, `fileno`, `rank_id`, `email`, `phone`, `department_id`, `monitor`, `status`, `date_created`, `date_updated`) VALUES
(49, 'PROF. SALISU ALI RAKUM', '12346', 2, 'njaujau@yahoo.com', '08025475896', 16, 0, 1, '2025-07-01 20:34:56', NULL),
(51, 'PROF. BARAKATU ABDULLAHI', '12348', 2, 'barakatuay@gmail.com', '08034476765', 16, 1, 1, '2025-07-01 20:34:56', '2025-09-21 22:52:32'),
(54, 'DR. SAMUEL ALFAYO BOH', '12351', 4, 'samuelalfayoboh02@gmail.com', '07037810409', 16, 1, 1, '2025-07-01 20:34:56', '2025-09-21 22:56:23'),
(55, 'DR. YAKUBU SALIHU MUHAMMAD', '12352', 4, 'docsamyak14@gmail.com', '08130009317', 16, 1, 1, '2025-07-01 20:34:56', '2025-09-21 22:58:58'),
(56, 'DR  GAMBO ADAMU ALIYU', '12353', 4, 'gamboadamualiyu@gmail.com', '08034540932', 16, 1, 1, '2025-07-01 20:34:56', '2025-09-21 22:56:46'),
(57, 'DR. NYITSE MARK', '12354', 5, 'nyitsemark@gmail.com', '08069483310', 16, 1, 1, '2025-07-01 20:34:57', '2025-09-21 22:56:35'),
(59, 'DR. ALABI MUTIU AYOFE', '12356', 5, 'mutiualabi4m53@yahoo.com', '08106231595', 16, 0, 1, '2025-07-01 20:34:57', NULL),
(60, 'DR. CLEMENT IGBAJI', '12357', 6, 'clementigbaji@gmail.com', '08032076249', 16, 1, 1, '2025-07-01 20:34:57', '2025-09-21 22:57:22'),
(64, 'MR. TSOHO ALIYU ABRAHAM', '12361', 6, 'abrahamtsohoaliyu869@yahoo.com', '08032416254', 16, 0, 1, '2025-07-01 20:34:57', NULL),
(67, 'MR. ABDULHAKEEM  SIDI UMAR', '12364', 6, 'abbasidi4sumee@gmail.com', '08030401316', 16, 0, 1, '2025-07-01 20:34:57', NULL),
(68, 'MR. HAMZA MUSA ABUBAKAR', '12365', 5, 'hamzamusaabubakar@gmail.com', '08031554182', 16, 1, 1, '2025-07-01 20:34:57', '2025-09-21 22:57:36'),
(69, 'MR. MUSA MOHAMMED', '12366', 6, 'kallam934@gmail.com', '07035981261', 16, 0, 1, '2025-07-01 20:34:57', NULL),
(71, 'MR. AHMED SADIQ', '12368', 0, 'asadiqbara@gmail.com', '08063078585', 0, 0, 0, '2025-07-01 20:34:57', '2025-09-22 05:17:48'),
(75, 'MR. YAZID DAHIRU', '12372', 0, 'yaziddahiru222@gmail.com', '08036306145', 0, 0, 0, '2025-07-01 20:34:58', '2025-09-22 05:20:28'),
(78, 'MR. USMAN SALEH MOHD', '12375', 6, 'abutahira2011@yahoo.com', '08065105919', 16, 0, 1, '2025-07-01 20:34:58', NULL),
(79, 'MRS. DORCAS BAKARI', '12376', 7, 'dorcas.bakari@gmail.com', '07032690288', 16, 0, 1, '2025-07-01 20:34:58', NULL),
(81, 'MR. ABUBAKAR MUSA ABDULLAHI', '12378', 0, 'abubakarmusaabdullahijalabi@gmail.com', '07069142520', 0, 0, 0, '2025-07-01 20:34:58', '2025-09-22 05:21:16'),
(84, 'ABUBAKAR MOHAMMED', '12381', 7, 'abusaabiiq@gmail.com', '08146086818', 16, 0, 1, '2025-07-01 20:34:58', NULL),
(85, 'SANUSI HARUNA MOHAMMED', '12382', 7, 'sanusiharunamuhammad123@gmail.com', '08037327044', 16, 0, 1, '2025-07-01 20:34:58', NULL),
(86, 'BELLO ABDULKADIR', '12383', 7, 'belkadir65@gmail.com', '08065469834', 16, 0, 1, '2025-07-01 20:34:58', NULL),
(48, 'DR. BASHIR ABDULLAHI', '514', 0, 'basirabdullahi305@gmail.com', '09033433556', 0, 1, 1, '2025-07-01 20:34:56', '2025-09-25 00:16:59'),
(113, 'NURA ALHAJI', 'AS 1569', 4, 'nuraalhaji2021@gmail.com', '08032492757', 16, 0, 1, '2025-09-23 10:33:39', NULL),
(114, 'PETER DOGO', 'AS 2199', 4, 'dogopeter083@gmail.com', '07087284916', 10, 0, 1, '2025-09-23 13:18:41', NULL),
(72, 'DR. DUNGUN GODFREY RIKAT', 'AS/0442', 6, 'grdungum@gmail.com', '08065557195', 16, 0, 1, '2025-07-01 20:34:57', '2025-07-03 09:12:30'),
(70, 'MRS. RUWAYDAH A. BELLO', 'AS/0515', 5, 'ruwaydahbello@gmail.com', '08031853147', 16, 0, 1, '2025-07-01 20:34:57', '2025-07-03 07:02:34'),
(61, 'DR. OYEWUMI KASSIM A.', 'AS/0549', 5, 'kaoyewumi@gmail.com', '08038038958', 16, 0, 1, '2025-07-01 20:34:57', '2025-07-03 06:56:18'),
(50, 'PROF. ISAAC ADAMU MSHELIZA', 'AS/0668', 2, 'musaadamumshelia@gmail.com', '08065355171', 16, 1, 1, '2025-07-01 20:34:56', '2025-09-21 22:53:04'),
(63, 'DR HAUWA A. MOHD', 'AS/1039', 6, 'hauwaabdullahimuhamad@gmail.com', '08033544790', 16, 0, 1, '2025-07-01 20:34:57', '2025-07-03 08:54:37'),
(13, 'DR. BELLO AHMED', 'AS/1227', 5, 'ahmadballow@gmail.com', '08035336420', 1, 0, 1, '2025-06-09 14:33:39', '2025-06-24 12:12:04'),
(91, 'ABUBAKAR ABDULKADIR A.', 'AS/1300', 5, 'sadeeqabu8@gmail.com', '08038042138', 17, 0, 1, '2025-07-02 13:36:45', NULL),
(25, 'MRS. SAMA’ILA D. ZULAI', 'AS/1340', 5, 'zulaisamaila@yahoo.com', '07069559551', 1, 0, 1, '2025-06-09 14:33:40', '2025-09-23 10:50:10'),
(40, 'DR. BAWA JOHN', 'AS/1343', 4, 'jbawa891@gmail.com', '08034016897', 1, 0, 1, '2025-06-24 10:57:26', NULL),
(26, 'MR. HARUNA IBRAHIM ALIYU', 'AS/1348', 5, 'harunaialiyu@gmail.com', '08030415176', 1, 0, 1, '2025-06-09 14:33:40', '2025-06-24 12:10:48'),
(90, 'Dr. YUNISA ABDULRAHMAN Y.', 'AS/1360', 5, 'abdulyunisa@gmail.com', '08035659475', 17, 0, 1, '2025-07-02 13:36:45', '2025-10-07 07:43:20'),
(7, 'DR. OGUNDARE SAMUEL AKINOLA', 'AS/1400', 4, 'samogundare91@gmail.com', '08035808537', 1, 0, 1, '2025-06-09 14:33:39', '2025-07-03 09:31:54'),
(9, 'DR. ISA SAGIRU', 'AS/1403', 5, 'sagiru5604@gmail.com', '08033552886', 1, 0, 1, '2025-06-09 14:33:39', '2025-07-03 08:57:49'),
(6, 'DR. ONIPEDE OMOLEYE', 'AS/1413', 5, 'leyniped@gmail.com', '08066767931', 1, 0, 1, '2025-06-09 14:33:39', '2025-09-23 10:04:00'),
(31, 'MR. MELA I. LAPPI', 'AS/1504', 5, 'melailulappi@gmail.com', '08067517178', 1, 0, 1, '2025-06-09 14:33:40', '2025-06-24 12:00:31'),
(109, 'AHMED MUHAMMAD WAZIRI', 'AS/1537', 5, 'ahmadwazirikumo@gmail.com', '08037389729', 16, 0, 1, '2025-07-03 09:27:16', '2025-09-22 05:37:01'),
(92, 'MUSTAPHA SALEH', 'AS/1561', 5, 'mustaphasaleh1990@gmail.com', '07039271752', 17, 0, 1, '2025-07-02 13:36:45', NULL),
(32, 'MR. MAILAYA JOJI MASOYI', 'AS/1587', 5, 'jojimasoyi@gmail.com', '07061393074', 1, 0, 1, '2025-06-09 14:33:40', '2025-06-24 11:58:47'),
(42, 'MUHAMMAD SALLAU MUHAMMAD', 'AS/1593', 7, 'muhammadsallaumuhammad@gmail.com', '08036818429', 17, 0, 1, '2025-06-24 11:43:32', '2025-07-02 13:38:18'),
(74, 'DR. IGBANGI NATHANIEL', 'AS/1608', 6, 'gberkyon@gmail.com', '07067129331', 16, 0, 1, '2025-07-01 20:34:57', '2025-07-04 12:04:17'),
(95, 'INUWA SHEHU YUSUF', 'AS/1658', 5, 'shehuayusuffa@yahoo.com', '08066757165', 17, 0, 1, '2025-07-02 13:36:45', NULL),
(76, 'MR. IBRAHIM LUKMAN JAHUN', 'AS/1667', 7, 'ljahun555@yahoo.com', '07031202728', 16, 0, 1, '2025-07-01 20:34:58', '2025-07-03 09:25:24'),
(23, 'MR. MOHAMMED ABDULLAHI', 'AS/1693', 6, 'abdullahim376@gmail.com', '08065559786', 4, 0, 1, '2025-06-09 14:33:40', '2025-09-13 13:06:38'),
(4, 'PROF. AHMED TAJUDEEN SHITTU', 'AS/1701', 5, 'bashhassan20203@gmail.com', '08162182220', 1, 1, 1, '2025-06-09 14:33:39', '2025-09-21 22:53:33'),
(107, 'DR SALISU MUSA SANI', 'AS/1709', 5, 'salisumusasani600@gmail.com', '080', 1, 0, 1, '2025-07-03 07:00:03', NULL),
(108, 'BASHIR TUKUR ADAMU', 'AS/1890', 7, 'bashirtukuradamu@gmail.com', '08031169423', 16, 0, 1, '2025-07-03 08:45:39', NULL),
(62, 'DR. ISAH JIBRIN', 'AS/1892', 5, 'ijibrin143@gmail.com', '08032729732', 16, 0, 1, '2025-07-01 20:34:57', '2025-07-03 09:16:01'),
(89, 'DR. MUKHTAR AMINU ZAITAWA', 'AS/19', 5, 'zaitawy35@gmail.com', '07033026696', 17, 0, 1, '2025-07-02 13:36:45', NULL),
(53, 'DR. MUSA ADAMU MSHELIA', 'AS/1904', 3, 'musaadamumshelia@gmail.com', '08036659531', 16, 1, 1, '2025-07-01 20:34:56', '2025-09-21 22:54:18'),
(21, 'MR. IBRAHIM ABUBAKAR', 'AS/1905', 6, 'ibrahimbogo@gmail.com', '08065075864', 15, 0, 1, '2025-06-09 14:33:39', '2025-07-03 09:28:29'),
(87, 'DR.ALIYU HASSAN DALHATU', 'AS/1925', 5, 'aliyudalhatudull7779@gmail.com', '08066776610', 17, 1, 1, '2025-07-02 13:36:45', '2025-09-21 22:55:27'),
(73, 'MR. MUHD BALA HASHIDU', 'AS/211', 6, 'balahashidu@gmail.com', '08022651871', 16, 1, 1, '2025-07-01 20:34:57', '2025-09-21 22:56:58'),
(94, 'DAHIRU ALIYU', 'AS/2120', 7, 'dahirualiyu02@gmail.com', '08166921921', 17, 1, 1, '2025-07-02 13:36:45', '2025-09-21 22:58:30'),
(104, 'ALHAJI DANLADI', 'AS/2121', 7, 'alhajidanladi8@gmail.com', '08036780770', 17, 0, 1, '2025-07-02 13:47:00', '2025-07-03 08:46:31'),
(97, 'BABANI BARDE', 'AS/2122', 7, 'bardebabani@gmail.com', '08066951197', 5, 0, 1, '2025-07-02 13:36:45', '2025-07-03 08:48:01'),
(33, 'MR. ADAMU JOSHUA', 'AS/2153', 5, 'joshualamika123@gmail.com', '07035115113', 1, 0, 1, '2025-06-09 14:33:40', '2025-08-05 11:03:58'),
(28, 'MRS. SAMUEL MARY', 'AS/2154', 7, 'samuelmary792@gmail.com', '08038204057', 15, 0, 1, '2025-06-09 14:33:40', '2025-07-03 09:41:49'),
(24, 'MRS. BENETH CHETACHUKU KEZIAH', 'AS/2157', 6, 'keziahben2016@gmail.com', '07066022199', 2, 0, 1, '2025-06-09 14:33:40', '2025-09-22 07:13:55'),
(27, 'MR. AYUBA BALA', 'AS/2159', 5, 'balaayuba1@gmail.com', '08063755678', 10, 1, 1, '2025-06-09 14:33:40', '2025-09-21 22:57:49'),
(102, 'AHMAD GARBA', 'AS/2169', 7, 'ahmadgarba315@gmail.com', '07030215179', 17, 0, 1, '2025-07-02 13:36:45', '2025-07-03 08:50:34'),
(3, 'PROF. ABDULHAMID AUWAL', 'AS/2190', 5, 'abdulhamidauwal@fukashere.edu.ng', '08028712901', 1, 1, 1, '2025-06-09 14:33:38', '2025-09-21 22:52:54'),
(52, 'DR. IBRAHIM YAKUBU WUNTI', 'AS/2250', 4, 'yakubuibrahimwunti@gmail.com', '08023341210', 16, 1, 1, '2025-07-01 20:34:56', '2025-09-21 22:56:10'),
(58, 'DR. LASISI ABASS AYODELE', 'AS/2295', 5, 'abasstps97@yahoo.com', '09034403969', 16, 0, 1, '2025-07-01 20:34:57', '2025-07-04 11:58:28'),
(29, 'MRS. ADAM MARYAM UMAR', 'AS/2306', 5, 'maryamumaradam3841@gmail.com', '08066113514', 1, 0, 1, '2025-06-09 14:33:40', '2025-06-24 12:03:26'),
(12, 'DR. MUHAMMAD BELLO', 'AS/2317', 5, 'muhdbello087@gmail.com', '08035873653', 11, 0, 1, '2025-06-09 14:33:39', '2025-10-01 06:44:20'),
(17, 'MR. JOSEPH MANU', 'AS/2321', 5, 'josephmanu9177@gmail.com', '08062573497', 1, 0, 1, '2025-06-09 14:33:39', '2025-09-16 21:55:54'),
(39, 'UMAR MAGAJI ABUBAKAR', 'AS/2341', 6, 'umarmagajia@gmail.com', '08030529940', 16, 0, 1, '2025-06-24 10:50:41', '2025-07-02 18:17:15'),
(110, 'DR. ISAH ABDULKARIM TILDE', 'AS/2345', 5, 'isahatilde@gmail.com', '080', 16, 0, 1, '2025-07-03 09:45:51', NULL),
(83, 'DR. DIANA INUSA', 'AS/2346', 6, 'dianainusatermana@gmail.com', '08034031654', 16, 1, 1, '2025-07-01 20:34:58', '2025-09-21 22:57:13'),
(82, 'MR. YAHUZA BIWAI', 'AS/2347', 6, 'yahuzabiwai@yahoo.com', '08029629701', 16, 0, 1, '2025-07-01 20:34:58', '2025-07-03 09:24:37'),
(14, 'DR. AHMED IBRAHIM', 'AS/2353', 5, 'ahmadkt21@gmail.com', '08034176161', 1, 0, 1, '2025-06-09 14:33:39', '2025-07-03 09:06:13'),
(8, 'DR. TYOOR IORSUGH TITUS', 'AS/2354', 5, 'tyooriorsughtitus@gmail.com', '08036431366', 1, 0, 1, '2025-06-09 14:33:39', '2025-10-01 08:08:39'),
(18, 'MR. EZEKIEL DAZI PAM', 'AS/2355', 6, 'daziezekiel@gmail.com', '08037668529', 1, 0, 1, '2025-06-09 14:33:39', '2025-07-03 09:03:39'),
(34, 'MR. YAHUZA ADAMU', 'AS/2372', 7, 'yahuzaadam23@gmail.com', '08031107804', 15, 0, 1, '2025-06-09 14:33:40', '2025-07-03 09:05:25'),
(38, 'MR. SA’IDU ADAMU BELLO', 'AS/2401', 5, 'bashhassan202037@gmail.com', '07035632244', 1, 0, 1, '2025-06-09 14:33:40', NULL),
(101, 'ABDULRAUF SANI', 'AS/2463', 7, 'saniabulrauf@gmail.com', '08064956294', 17, 0, 1, '2025-07-02 13:36:45', '2025-09-21 16:39:48'),
(41, 'ABUBAKAR MOHAMMED', 'AS/2464', 6, 'abuamirandamira@gmail.com', '08146086818', 16, 0, 1, '2025-06-24 11:14:07', '2025-10-02 13:56:54'),
(93, 'AHMED ABUBAKAR', 'AS/2467', 5, 'ahminaad54@gmail.com', '08022889295', 17, 0, 1, '2025-07-02 13:36:45', NULL),
(100, 'AMINA ALIYU AJI', 'AS/2468', 7, 'aminaaji5@gmail.com', '07039566898', 16, 0, 1, '2025-07-02 13:36:45', '2025-09-22 15:27:39'),
(98, 'IBRAHIM BAWA', 'AS/2472', 5, 'bawaibrahim166@gmail.com', '08063051935', 17, 0, 1, '2025-07-02 13:36:45', '2025-09-23 10:51:38'),
(99, 'MUSA A. BABAYO', 'AS/2473', 5, 'musawalah@gmail.com', '08036763809', 17, 0, 1, '2025-07-02 13:36:45', NULL),
(106, 'DR. VINCENT YOHANNA IWAH', 'AS/2475', 6, 'vincentiwah@gmail.com', '07068078015', 16, 1, 1, '2025-07-03 06:54:46', '2025-09-21 22:58:40'),
(22, 'MR .ISMA’IL ABDURRAZAK', 'AS/2479', 6, 'abdurrazak.ismail@fukashere.edu.ng', '08161515025', 2, 0, 1, '2025-06-09 14:33:40', '2025-07-03 09:02:30'),
(30, 'MR. CHRISTOPHER YOHANNA', 'AS/2480', 5, 'chriscymc@gmail.com', '08037751572', 2, 0, 1, '2025-06-09 14:33:40', '2025-07-03 06:45:50'),
(10, 'DR. DAUDA MUHAMMED', 'AS/3069', 5, 'dawudbnmuhammad@gmail.com', '08036286850', 1, 0, 1, '2025-06-09 14:33:39', '2025-09-23 10:47:54'),
(37, 'MR. USMAN IDRIS', 'AS/3070', 7, 'shehu100@gmail.com', '08038891436', 15, 0, 1, '2025-06-09 14:33:40', '2025-09-22 05:03:37'),
(103, 'SHUAIBU IBRAHIM', 'AS/3136', 5, 'shuaibuibrahim210@gmail.com', '08034513295', 17, 0, 1, '2025-07-02 13:36:46', NULL),
(35, 'MR. MUHAMMED IBRAHIM ABBA', 'AS/3139', 7, 'bonga2004@hotmail.com', '08067948703', 1, 0, 1, '2025-06-09 14:33:40', '2025-07-03 08:52:09'),
(36, 'MR.ALIYU NASIRU TAMBUWAL', 'AS/3177', 7, 'nasirtamb@gmail.com', '08065199579', 2, 0, 1, '2025-06-09 14:33:40', '2025-07-03 06:51:09'),
(105, 'UMAR ALI MAGAJI', 'AS/3180', 6, 'magajiumar76@gmail.com', '08031169423', 16, 1, 1, '2025-07-02 13:52:11', '2025-09-21 22:58:11'),
(19, 'MR. BAMUSA KWAMI HABU', 'AS/3203', 5, 'habuhabu6@gmail.com', '08032854171', 1, 0, 1, '2025-06-09 14:33:39', '2025-07-03 09:43:35'),
(111, 'USMAN ADAMU ALKALI', 'AS/3233', 7, 'usmanadamualkali@gmail.com', '080', 16, 0, 1, '2025-07-03 09:48:23', NULL),
(20, 'MR. KUNTA DANYO', 'AS/3253', 5, 'kuntadanyo1@gmail.com', '08039207630', 1, 0, 1, '2025-06-09 14:33:39', '2025-08-05 11:01:00'),
(112, 'ZAHRA\'U YUSUF MUHAMMAD BABA', 'AS/3280', 7, 'zahrababa1987@gmail.com', '08036535698', 16, 0, 1, '2025-07-04 11:59:50', NULL),
(15, 'DR. DANIEL HYELYANKURI', 'AS/519', 6, 'yankuri1@yahoo.com', '08027993733', 1, 0, 1, '2025-06-09 14:33:39', '2025-09-25 19:27:52'),
(5, 'DR. TUKUR MADU YEMI', 'AS/524', 5, 'bashhassan20204@gmail.com', '08066289200', 1, 1, 1, '2025-06-09 14:33:39', '2025-09-21 22:55:38'),
(16, 'DR. SANI ALHAJI UMAR ', 'AS/551', 6, 'umarsani365@gmail.com', '08036556222', 14, 0, 1, '2025-06-09 14:33:39', '2025-10-01 06:00:52'),
(11, 'DR. MOHAMMED ABDULLAHI', 'AS/558', 5, 'abdullahi.mhammad41@gmail.com', '07060422933', 1, 0, 1, '2025-06-09 14:33:39', '2025-06-24 11:55:21'),
(2, 'PROF. SOFEME REUBEN JEBSON', 'AS/577', 5, 'sofemejebson@yahoo.com', '08037513696', 1, 1, 1, '2025-06-09 14:33:38', '2025-09-21 22:52:42'),
(88, 'PROF. UMARU SHUAIBU', 'AS/673', 5, 'shuaibumaru@gmail.com', '07064325551', 17, 0, 1, '2025-07-02 13:36:45', NULL),
(77, 'MRS FATIMA UMAR', 'AS/828', 6, 'marafandeba@gmail.com', '08065848491', 16, 0, 1, '2025-07-01 20:34:58', '2025-07-03 09:20:51'),
(66, 'DR. GARBA SULEIMAN DANMAITABA', 'AS/888', 6, 'danmaitabag@gmail.com', '07061346602', 16, 1, 1, '2025-07-01 20:34:57', '2025-09-24 22:07:10');

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
  MODIFY `id` int(7) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=115;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
