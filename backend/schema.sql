-- =====================================================================
-- LunaCare · Esquema de base de datos (MySQL 5.7+ / utf8mb4)
-- Se importa manualmente desde phpMyAdmin o se auto-crea con la API.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS lunacare CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lunacare;

-- Cuentas: anónimas (código de referencia + PIN), con correo o con Google.
-- El servidor NUNCA ve el PIN/contraseña en claro: guarda bcrypt(sha256(secreto)).
-- `google_sub` es el identificador estable de Google (`sub`); NULL si no está
-- vinculada. El salt PBKDF2 permite derivar la clave de la bóveda sin conocerla.
CREATE TABLE IF NOT EXISTS users (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bóveda cifrada de cada cuenta (ajustes + registros diarios, AES-256-GCM cliente).
CREATE TABLE IF NOT EXISTS vaults (
    user_id BINARY(16) PRIMARY KEY,
    data_enc LONGTEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    CONSTRAINT fk_vault_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tokens de sesión (se guarda solo el sha256 del token).
CREATE TABLE IF NOT EXISTS tokens (
    token_hash CHAR(64) PRIMARY KEY,
    user_id BINARY(16) NOT NULL,
    expires_at BIGINT NOT NULL,
    CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Anti fuerza-bruta: intentos de acceso (solo hash del identificador e IP hasheada).
-- Política: máx. 5 intentos/minuto y 20/hora por cuenta; 30/min por IP.
CREATE TABLE IF NOT EXISTS login_attempts (
    identifier_hash CHAR(64) NOT NULL,
    ip CHAR(64) NOT NULL DEFAULT '',
    attempted_at BIGINT NOT NULL,
    KEY idx_ident (identifier_hash, attempted_at),
    KEY idx_ip (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
