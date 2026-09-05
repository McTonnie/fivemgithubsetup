-- ════════════════════════════════════════════════════════════
-- Apex Billboards — MySQL schema
-- Optional: the resource creates this table automatically on first
-- start when oxmysql is available. Run manually only if your DB user
-- lacks CREATE TABLE rights.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `apex_billboards` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`       VARCHAR(64)  NOT NULL DEFAULT 'Untitled',
    `kind`       VARCHAR(12)  NOT NULL DEFAULT 'world',   -- world | vehicle
    `plate`      VARCHAR(16)  NULL DEFAULT NULL,          -- vehicle boards only
    `owner`      VARCHAR(64)  NOT NULL,                   -- identifier / citizenid
    `owner_name` VARCHAR(64)  NOT NULL DEFAULT '',
    `data`       LONGTEXT     NOT NULL,                   -- faces, content, settings (JSON)
    `enabled`    TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `plate` (`plate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
