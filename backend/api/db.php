<?php
/**
 * Conexión PDO + auto-creación del esquema (idempotente).
 * La base `lunacare` y sus tablas se crean solas en la primera petición.
 */
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = require __DIR__ . '/config.php';
    $d = $cfg['db'];
    $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $d['host'], $d['port']);

    $root = new PDO($dsn, $d['user'], $d['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $root->exec(
        "CREATE DATABASE IF NOT EXISTS `{$d['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    );

    $pdo = new PDO($dsn . ";dbname={$d['name']}", $d['user'], $d['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    ensure_schema($pdo);

    return $pdo;
}

function ensure_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS users (
            id BINARY(16) PRIMARY KEY,
            mode ENUM('anon','email','google') NOT NULL,
            email VARCHAR(190) NULL UNIQUE,
            password_hash VARCHAR(255) NULL,
            salt VARCHAR(64) NULL,
            ref_code_hash CHAR(64) NULL UNIQUE,
            pin_hash VARCHAR(255) NULL,
            google_sub VARCHAR(64) NULL UNIQUE,
            created_at BIGINT NOT NULL,
            KEY idx_mode (mode)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    migrate_google_columns($pdo);
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS vaults (
            user_id BINARY(16) PRIMARY KEY,
            data_enc LONGTEXT NOT NULL,
            updated_at BIGINT NOT NULL,
            CONSTRAINT fk_vault_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS tokens (
            token_hash CHAR(64) PRIMARY KEY,
            user_id BINARY(16) NOT NULL,
            expires_at BIGINT NOT NULL,
            CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    // Anti fuerza-bruta: solo hashes de identificadores + timestamps (sin datos sensibles).
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS login_attempts (
            identifier_hash CHAR(64) NOT NULL,
            ip CHAR(64) NOT NULL DEFAULT '',
            attempted_at BIGINT NOT NULL,
            KEY idx_ident (identifier_hash, attempted_at),
            KEY idx_ip (ip, attempted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
}

/**
 * Migración idempotente para bases creadas antes del inicio de sesión con
 * Google: añade `users.google_sub` y el valor 'google' al ENUM de `mode`.
 * No toca ninguna fila existente.
 */
function migrate_google_columns(PDO $pdo): void
{
    $columns = $pdo->query('SHOW COLUMNS FROM users')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('google_sub', $columns, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) NULL UNIQUE');
    }

    $mode = $pdo->query("SHOW COLUMNS FROM users LIKE 'mode'")->fetch(PDO::FETCH_ASSOC);
    if (is_array($mode) && stripos((string) ($mode['Type'] ?? ''), 'google') === false) {
        $pdo->exec("ALTER TABLE users MODIFY mode ENUM('anon','email','google') NOT NULL");
    }
}
