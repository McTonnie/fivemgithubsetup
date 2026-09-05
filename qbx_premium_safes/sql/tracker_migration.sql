ALTER TABLE `safe_access` ADD COLUMN `can_view_progress` TINYINT(1) NOT NULL DEFAULT 0 AFTER `can_view_logs`;

ALTER TABLE `safes` ADD COLUMN `period_days` INT NOT NULL DEFAULT 7 AFTER `tracking_upgrade_owned`;
ALTER TABLE `safes` ADD COLUMN `period_start` TIMESTAMP NULL DEFAULT NULL AFTER `period_days`;

CREATE TABLE IF NOT EXISTS `safe_tracked_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_id` INT NOT NULL,
  `item_name` VARCHAR(64) NOT NULL,
  `required_amount` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_safe_item` (`safe_id`, `item_name`),
  CONSTRAINT `fk_tracked_items_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `safe_tracker` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_id` INT NOT NULL,
  `member_name` VARCHAR(128) NOT NULL,
  `linked_citizenid` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_safe_member` (`safe_id`, `member_name`),
  KEY `idx_safe_tracker_citizenid` (`safe_id`, `linked_citizenid`),
  CONSTRAINT `fk_safe_tracker_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `safe_tracker_progress` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_id` INT NOT NULL,
  `member_name` VARCHAR(128) NOT NULL,
  `item_name` VARCHAR(64) NOT NULL,
  `amount` INT NOT NULL DEFAULT 0,
  `period_start` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_tracker_progress` (`safe_id`, `member_name`, `item_name`, `period_start`),
  KEY `idx_tracker_progress_period` (`safe_id`, `period_start`),
  CONSTRAINT `fk_tracker_progress_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `safe_tracker_archive` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_id` INT NOT NULL,
  `period_start` TIMESTAMP NOT NULL,
  `period_end` TIMESTAMP NOT NULL,
  `archive_data` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tracker_archive_safe` (`safe_id`, `period_start`),
  CONSTRAINT `fk_tracker_archive_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
