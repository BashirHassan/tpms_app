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
-- Table structure for table `tbl_ranks`
--

CREATE TABLE `tbl_ranks` (
  `id` int(5) NOT NULL,
  `rank` varchar(50) NOT NULL,
  `rank_abr` varchar(11) NOT NULL,
  `local_running` double NOT NULL,
  `transport` double NOT NULL,
  `dta` double NOT NULL,
  `dsa` double NOT NULL,
  `tetfund` double NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tbl_ranks`
--

INSERT INTO `tbl_ranks` (`id`, `rank`, `rank_abr`, `local_running`, `transport`, `dta`, `dsa`, `tetfund`) VALUES
(1, 'HOD', 'HOD', 5000, 140, 37500, 11250, 151250),
(2, 'Professor', 'PROF', 5000, 140, 37500, 11250, 151250),
(3, 'Reader', 'RD', 5000, 140, 37500, 11250, 151250),
(4, 'Senior Lecturer', 'SL', 5000, 140, 25000, 7500, 102500),
(5, 'Lecturer I', 'LI', 5000, 140, 20000, 6000, 83000),
(6, 'Lecturer II', 'LII', 5000, 140, 20000, 6000, 83000),
(7, 'Assistant Lecturer', 'AL', 5000, 140, 17500, 5250, 73250),
(8, 'Graduate Assistant', 'GA', 5000, 140, 17500, 5250, 73250);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `tbl_ranks`
--
ALTER TABLE `tbl_ranks`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `tbl_ranks`
--
ALTER TABLE `tbl_ranks`
  MODIFY `id` int(5) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
