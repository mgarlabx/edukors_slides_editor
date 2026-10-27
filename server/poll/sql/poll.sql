-- Edukors interactive questions -- MySQL / MariaDB schema.
--
-- Create the database first (on shared hosting the panel names it), then:
--
--   mysql -u <user> -p <database> < sql/poll.sql
--
-- All dates are stored in UTC.

-- One row per presenter. Only the SHA-256 of the key is kept.
CREATE TABLE IF NOT EXISTS poll_presenter (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_hash      CHAR(64)     NOT NULL,
  name          VARCHAR(120) NOT NULL,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL,
  last_login_at DATETIME     NULL,
  UNIQUE KEY uk_key (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A presenter's sign-in, valid for 12 hours. Only the SHA-256 of the token is kept.
CREATE TABLE IF NOT EXISTS poll_session (
  token_hash   CHAR(64)     NOT NULL PRIMARY KEY,
  presenter_id INT UNSIGNED NOT NULL,
  created_at   DATETIME     NOT NULL,
  expires_at   DATETIME     NOT NULL,
  KEY ix_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One room per question and round. meta = number of options for a quiz.
CREATE TABLE IF NOT EXISTS poll_room (
  room         CHAR(6)      NOT NULL PRIMARY KEY,
  presenter_id INT UNSIGNED NOT NULL,
  type         ENUM('quiz','tag','post') NOT NULL,
  meta         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL,
  closed_at    DATETIME     NULL,
  KEY ix_presenter (presenter_id, created_at),
  KEY ix_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One answer per participant (a random id kept by the student's browser) and room.
CREATE TABLE IF NOT EXISTS poll_response (
  room        CHAR(6)      NOT NULL,
  participant CHAR(16)     NOT NULL,
  response    VARCHAR(500) NOT NULL,
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (room, participant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add a presenter (or use: php bin/newkey.php "Name"). Use a long random key.
-- INSERT INTO poll_presenter (key_hash, name, active, created_at)
--   VALUES (SHA2('EDK-XXXX-XXXX-XXXX', 256), 'Presenter name', 1, UTC_TIMESTAMP());
