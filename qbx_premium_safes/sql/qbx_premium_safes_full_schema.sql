CREATE TABLE IF NOT EXISTS `safes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_name` VARCHAR(64) NOT NULL,
  `owner_identifier` VARCHAR(64) NOT NULL,
  `owner_name` VARCHAR(128) NOT NULL,
  `assigned_group_type` VARCHAR(32) DEFAULT NULL,
  `assigned_group_name` VARCHAR(64) DEFAULT NULL,
  `placed_by` VARCHAR(64) NOT NULL,
  `model` VARCHAR(64) NOT NULL,
  `x` DECIMAL(10,4) NOT NULL,
  `y` DECIMAL(10,4) NOT NULL,
  `z` DECIMAL(10,4) NOT NULL,
  `heading` DECIMAL(10,4) NOT NULL DEFAULT 0,
  `stash_token` VARCHAR(64) NOT NULL,
  `tracking_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `tracked_item` VARCHAR(64) DEFAULT NULL,
  `tracked_items` LONGTEXT DEFAULT NULL,
  `required_amount` INT NOT NULL DEFAULT 0,
  `reset_type` VARCHAR(16) NOT NULL DEFAULT 'manual',
  `last_reset_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `slots` INT NOT NULL DEFAULT 45,
  `max_weight` INT NOT NULL DEFAULT 250000,
  `storage_tier` INT NOT NULL DEFAULT 0,
  `alarm_upgrade_owned` TINYINT(1) NOT NULL DEFAULT 0,
  `owner_online_required` TINYINT(1) NOT NULL DEFAULT 0,
  `tracking_upgrade_owned` TINYINT(1) NOT NULL DEFAULT 0,
  `access_upgrade_owned` TINYINT(1) NOT NULL DEFAULT 0,
  `is_placed` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_stash_token` (`stash_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `safe_access` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_id` INT NOT NULL,
  `identifier` VARCHAR(64) NOT NULL,
  `player_name` VARCHAR(128) NOT NULL,
  `access_role` VARCHAR(32) NOT NULL DEFAULT 'member',
  `added_by` VARCHAR(64) DEFAULT NULL,
  `can_deposit` TINYINT(1) NOT NULL DEFAULT 1,
  `can_withdraw` TINYINT(1) NOT NULL DEFAULT 0,
  `can_manage` TINYINT(1) NOT NULL DEFAULT 0,
  `can_view_logs` TINYINT(1) NOT NULL DEFAULT 0,
  `added_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_safe_access` (`safe_id`, `identifier`),
  CONSTRAINT `fk_safe_access_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `safe_contributions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_id` INT NOT NULL,
  `identifier` VARCHAR(64) NOT NULL,
  `player_name` VARCHAR(128) NOT NULL,
  `item_name` VARCHAR(64) DEFAULT NULL,
  `amount_deposited` INT NOT NULL DEFAULT 0,
  `total_progress` INT NOT NULL DEFAULT 0,
  `completed` TINYINT(1) NOT NULL DEFAULT 0,
  `period_start` DATE NOT NULL,
  `last_deposit_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_safe_contribution` (`safe_id`, `identifier`, `item_name`),
  KEY `idx_safe_progress` (`safe_id`, `completed`),
  CONSTRAINT `fk_safe_contributions_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `safe_crack_attempts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_id` INT NOT NULL,
  `identifier` VARCHAR(64) NOT NULL,
  `player_name` VARCHAR(128) NOT NULL,
  `success` TINYINT(1) NOT NULL DEFAULT 0,
  `method` VARCHAR(32) NOT NULL,
  `item_used` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_safe_cracks` (`safe_id`, `success`),
  CONSTRAINT `fk_safe_cracks_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `safe_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `safe_id` INT NOT NULL,
  `actor_identifier` VARCHAR(64) DEFAULT NULL,
  `actor_name` VARCHAR(128) DEFAULT NULL,
  `action` VARCHAR(48) NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `payload` LONGTEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_safe_logs` (`safe_id`, `action`, `created_at`),
  CONSTRAINT `fk_safe_logs_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
