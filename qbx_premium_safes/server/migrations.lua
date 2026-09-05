local MIGRATION_VERSION = 1

local MIGRATIONS = {}

MIGRATIONS[1] = function()
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safes` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `owner_identifier` VARCHAR(128) NOT NULL,
        `owner_name` VARCHAR(128) NOT NULL,
        `safe_name` VARCHAR(128) NOT NULL,
        `model` VARCHAR(64) NOT NULL,
        `x` FLOAT NOT NULL,
        `y` FLOAT NOT NULL,
        `z` FLOAT NOT NULL,
        `heading` FLOAT NOT NULL DEFAULT 0,
        `stash_token` VARCHAR(64) NOT NULL,
        `slots` INT NOT NULL DEFAULT 45,
        `max_weight` INT NOT NULL DEFAULT 250000,
        `storage_tier` INT NOT NULL DEFAULT 1,
        `alarm_upgrade_owned` TINYINT(1) NOT NULL DEFAULT 0,
        `owner_online_required` TINYINT(1) NOT NULL DEFAULT 0,
        `tracking_upgrade_owned` TINYINT(1) NOT NULL DEFAULT 0,
        `access_upgrade_owned` TINYINT(1) NOT NULL DEFAULT 0,
        `tracking_enabled` TINYINT(1) NOT NULL DEFAULT 1,
        `assigned_group_type` VARCHAR(64) DEFAULT NULL,
        `assigned_group_name` VARCHAR(128) DEFAULT NULL,
        `is_placed` TINYINT(1) NOT NULL DEFAULT 1,
        `period_days` INT NOT NULL DEFAULT 7,
        `period_start` TIMESTAMP NULL DEFAULT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_owner` (`owner_identifier`),
        KEY `idx_stash_token` (`stash_token`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_access` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `safe_id` INT NOT NULL,
        `player_identifier` VARCHAR(128) NOT NULL,
        `player_name` VARCHAR(128) NOT NULL,
        `can_deposit` TINYINT(1) NOT NULL DEFAULT 0,
        `can_withdraw` TINYINT(1) NOT NULL DEFAULT 0,
        `can_manage` TINYINT(1) NOT NULL DEFAULT 0,
        `can_view_logs` TINYINT(1) NOT NULL DEFAULT 0,
        `can_view_progress` TINYINT(1) NOT NULL DEFAULT 0,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uniq_safe_player` (`safe_id`, `player_identifier`),
        KEY `idx_safe_access_identifier` (`player_identifier`),
        CONSTRAINT `fk_safe_access` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_logs` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `safe_id` INT NOT NULL,
        `actor_identifier` VARCHAR(128) NOT NULL,
        `actor_name` VARCHAR(128) NOT NULL,
        `action` VARCHAR(64) NOT NULL,
        `message` TEXT,
        `payload` LONGTEXT,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_safe_logs_safe` (`safe_id`),
        CONSTRAINT `fk_safe_logs` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_contributions` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `safe_id` INT NOT NULL,
        `citizenid` VARCHAR(64) NOT NULL,
        `item_name` VARCHAR(64) NOT NULL,
        `amount` INT NOT NULL DEFAULT 0,
        `period_start` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uniq_contribution` (`safe_id`, `citizenid`, `item_name`, `period_start`),
        KEY `idx_contributions_safe` (`safe_id`),
        CONSTRAINT `fk_safe_contributions` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_crack_attempts` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `safe_id` INT NOT NULL,
        `cracker_identifier` VARCHAR(128) NOT NULL,
        `cracker_name` VARCHAR(128) NOT NULL,
        `success` TINYINT(1) NOT NULL DEFAULT 0,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_crack_safe` (`safe_id`),
        CONSTRAINT `fk_crack_attempts` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_tracked_items` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `safe_id` INT NOT NULL,
        `item_name` VARCHAR(64) NOT NULL,
        `required_amount` INT NOT NULL DEFAULT 0,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uniq_safe_item` (`safe_id`, `item_name`),
        CONSTRAINT `fk_tracked_items_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_tracker` (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_tracker_progress` (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_tracker_archive` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `safe_id` INT NOT NULL,
        `period_start` TIMESTAMP NOT NULL,
        `period_end` TIMESTAMP NOT NULL,
        `archive_data` LONGTEXT NOT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_tracker_archive_safe` (`safe_id`, `period_start`),
        CONSTRAINT `fk_tracker_archive_safe` FOREIGN KEY (`safe_id`) REFERENCES `safes` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_schema_version` (
        `version` INT NOT NULL,
        `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`version`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])
end

local function columnExists(tableName, columnName)
    local result = MySQL.query.await(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
        { tableName, columnName }
    )
    return result and #result > 0
end

local function tableExists(tableName)
    local result = MySQL.query.await(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
        { tableName }
    )
    return result and #result > 0
end

function RunMigrations()
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `safe_schema_version` (
        `version` INT NOT NULL,
        `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`version`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])

    local currentVersion = 0
    local versionRow = MySQL.query.await("SELECT version FROM safe_schema_version ORDER BY version DESC LIMIT 1")
    if versionRow and #versionRow > 0 then
        currentVersion = tonumber(versionRow[1].version) or 0
    end

    for version = currentVersion + 1, MIGRATION_VERSION do
        local migrationFunc = MIGRATIONS[version]
        if migrationFunc then
            migrationFunc()
            MySQL.query.await("INSERT INTO safe_schema_version (version) VALUES (?)", { version })
            print(('[qbx_premium_safes] Applied migration version %d'):format(version))
        end
    end

    if not columnExists('safe_access', 'can_view_progress') then
        MySQL.query.await("ALTER TABLE `safe_access` ADD COLUMN `can_view_progress` TINYINT(1) NOT NULL DEFAULT 0 AFTER `can_view_logs`")
        print('[qbx_premium_safes] Added can_view_progress column to safe_access')
    end

    if tableExists('safes') then
        if not columnExists('safes', 'is_placed') then
            MySQL.query.await("ALTER TABLE `safes` ADD COLUMN `is_placed` TINYINT(1) NOT NULL DEFAULT 1")
            print('[qbx_premium_safes] Added is_placed column to safes')
        end
        if not columnExists('safes', 'access_upgrade_owned') then
            MySQL.query.await("ALTER TABLE `safes` ADD COLUMN `access_upgrade_owned` TINYINT(1) NOT NULL DEFAULT 0")
            print('[qbx_premium_safes] Added access_upgrade_owned column to safes')
        end
        if not columnExists('safes', 'period_days') then
            MySQL.query.await("ALTER TABLE `safes` ADD COLUMN `period_days` INT NOT NULL DEFAULT 7")
            print('[qbx_premium_safes] Added period_days column to safes')
        end
        if not columnExists('safes', 'period_start') then
            MySQL.query.await("ALTER TABLE `safes` ADD COLUMN `period_start` TIMESTAMP NULL DEFAULT NULL")
            print('[qbx_premium_safes] Added period_start column to safes')
        end
    end
end
