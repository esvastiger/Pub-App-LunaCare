<?php
/**
 * LunaCare API — enrutador único (sin dependencia de mod_rewrite).
 *
 * Uso: index.php?action=<accion>  (POST con cuerpo JSON)
 * Acciones: ping · register.anon · login.anon · register.email · login.email
 *           link.email · auth.google · link.google · vault.get · vault.put
 *
 * Privacidad: el servidor solo recibe hashes SHA-256 como credenciales y la
 * bóveda de datos ya cifrada (AES-256-GCM) por el cliente. Nunca ve datos en claro.
 */
declare(strict_types=1);

// `require` (no `require_once`): así siempre devuelve el array de configuración.
$config = require __DIR__ . '/config.php';

// CORS configurable: '*' solo para desarrollo. En producción, restringe
// `cors_origin` al dominio real de la app (config.local.php / variable de entorno).
header('Access-Control-Allow-Origin: ' . ($config['cors_origin'] ?? '*'));
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/db.php';
require __DIR__ . '/google.php';

function respond(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function fail(string $error, int $code = 400): void
{
    respond(['ok' => false, 'error' => $error], $code);
}

function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    return is_array($json) ? $json : [];
}

function uuid16(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return $b;
}

/**
 * Rate limiting anti fuerza-bruta sobre la tabla login_attempts.
 * Solo se almacenan hashes (identificador e IP): nada sensible en claro.
 *
 * Política: 5 intentos/minuto y 20/hora por cuenta + 30/min por IP.
 * Si se supera, responde 429 con los segundos restantes y corta la petición.
 */
function rate_limit(PDO $pdo, string $identifierHash, bool $withIp = true): void
{
    $identHash = hash('sha256', 'lunacare:ident:' . $identifierHash);
    $now = time();

    // Purga barata de intentos antiguos (~1% de las peticiones; no hay cron).
    if (random_int(1, 100) === 1) {
        $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < ?')->execute([$now - 86400]);
    }

    $check = function (string $col, string $val, int $window, int $max) use ($pdo, $now, $identHash): ?int {
        $st = $pdo->prepare("SELECT attempted_at FROM login_attempts WHERE {$col} = ? AND attempted_at > ? ORDER BY attempted_at ASC");
        $st->execute([$val, $now - $window]);
        $times = $st->fetchAll(PDO::FETCH_COLUMN);
        if (count($times) < $max) {
            return null;
        }
        // Ventana deslizante: espera hasta que el intento más antiguo salga del periodo.
        return max(1, (int) ceil(((int) $times[0] + $window) - $now));
    };

    $waits = [
        $check('identifier_hash', $identHash, 60, 5),
        $check('identifier_hash', $identHash, 3600, 20),
    ];
    if ($withIp) {
        $ipHash = hash('sha256', 'lunacare:ip:' . client_ip());
        $waits[] = $check('ip', $ipHash, 60, 30);
    }
    $hits = array_filter($waits, fn($w) => $w !== null && $w > 0);
    $wait = $hits ? max($hits) : null;
    if ($wait) {
        http_response_code(429);
        header('Retry-After: ' . $wait);
        echo json_encode(['ok' => false, 'error' => 'TOO_MANY_ATTEMPTS', 'retryAfter' => $wait]);
        exit;
    }

    $pdo->prepare('INSERT INTO login_attempts (identifier_hash, ip, attempted_at) VALUES (?, ?, ?)')
        ->execute([$identHash, $withIp ? hash('sha256', 'lunacare:ip:' . client_ip()) : '', $now]);
}

function rate_limit_clear(PDO $pdo, string $identifierHash): void
{
    $pdo->prepare('DELETE FROM login_attempts WHERE identifier_hash = ?')
        ->execute([hash('sha256', 'lunacare:ident:' . $identifierHash)]);
}

/**
 * Límite por IP para acciones sin identificador previo (p. ej. Google).
 * 30 intentos/minuto: suficiente para una persona, corto para un script.
 */
function rate_limit_ip(PDO $pdo, string $bucket, int $maxPerMinute = 30): void
{
    $now = time();
    $ipHash = hash('sha256', 'lunacare:ip:' . client_ip());
    $st = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND attempted_at > ?');
    $st->execute([$ipHash, $now - 60]);
    if ((int) $st->fetchColumn() >= $maxPerMinute) {
        header('Retry-After: 60');
        respond(['ok' => false, 'error' => 'TOO_MANY_ATTEMPTS', 'retryAfter' => 60], 429);
    }
    $pdo->prepare('INSERT INTO login_attempts (identifier_hash, ip, attempted_at) VALUES (?, ?, ?)')
        ->execute([hash('sha256', 'lunacare:ident:' . $bucket), $ipHash, $now]);
}

/**
 * Verifica el ID token de Google del cuerpo y devuelve {sub, email, name, picture}.
 * Traduce los fallos internos a errores JSON de la API.
 */
function google_identity(PDO $pdo, array $config, array $in, bool $rateLimited = true): array
{
    $credential = $in['credential'] ?? '';
    if (!is_string($credential) || $credential === '') {
        fail('BAD_REQUEST');
    }
    $clientId = (string) ($config['google']['client_id'] ?? '');
    if ($clientId === '') {
        fail('GOOGLE_NOT_CONFIGURED', 503);
    }
    if ($rateLimited) {
        rate_limit_ip($pdo, 'google');
    }

    try {
        return verify_google_id_token($credential, $clientId);
    } catch (RuntimeException $e) {
        $error = $e->getMessage();
        if ($error === 'GOOGLE_NOT_CONFIGURED') {
            fail('GOOGLE_NOT_CONFIGURED', 503);
        }
        if ($error === 'GOOGLE_KEYS_UNAVAILABLE' || $error === 'GOOGLE_KEYS_INVALID') {
            fail('GOOGLE_UNAVAILABLE', 502);
        }
        fail('GOOGLE_TOKEN_INVALID', 401);
    }
}

/** Mejor esfuerzo para obtener la IP del cliente (detrás de Apache local, remota). */
function client_ip(): string
{
    foreach (['HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            return trim(explode(',', (string) $_SERVER[$k])[0]);
        }
    }
    return '';
}

function issue_token(PDO $pdo, string $userId): string
{
    $cfg = require __DIR__ . '/config.php';
    $token = bin2hex(random_bytes(32));
    $st = $pdo->prepare('INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
    $st->execute([hash('sha256', $token), $userId, time() + $cfg['token_days'] * 86400]);
    return $token;
}

/** Valida el token (Authorization: Bearer o campo 'token' del cuerpo) y devuelve el usuario. */
function auth_user(PDO $pdo, array $in): array
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    $token = null;
    if (preg_match('/Bearer\s+(\S+)/i', $h, $m)) {
        $token = $m[1];
    }
    // Fallback para hosts que eliminan la cabecera Authorization.
    if (!$token && isset($in['token']) && is_string($in['token']) && $in['token'] !== '') {
        $token = $in['token'];
    }
    if (!$token) {
        fail('UNAUTHORIZED', 401);
    }
    $st = $pdo->prepare(
        'SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.expires_at > ?'
    );
    $st->execute([hash('sha256', $token), time()]);
    $user = $st->fetch();
    if (!$user) {
        fail('UNAUTHORIZED', 401);
    }
    return $user;
}

$action = $_GET['action'] ?? '';
$in = body();
$pdo = db();

try {
    switch ($action) {
        case 'ping':
            respond(['ok' => true, 'app' => 'LunaCare API', 'time' => time()]);

        case 'register.anon': {
            $ref = $in['refCodeHash'] ?? '';
            $pin = $in['pinVerifier'] ?? '';
            if (!is_string($ref) || !preg_match('/^[a-f0-9]{64}$/', $ref) || !is_string($pin) || $pin === '') {
                fail('BAD_REQUEST');
            }
            $st = $pdo->prepare('SELECT id FROM users WHERE ref_code_hash = ?');
            $st->execute([$ref]);
            if ($st->fetch()) {
                fail('REF_TAKEN', 409);
            }
            $id = uuid16();
            $pdo->prepare('INSERT INTO users (id, mode, ref_code_hash, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([$id, 'anon', $ref, password_hash($pin, PASSWORD_DEFAULT), time()]);
            respond(['ok' => true, 'userId' => bin2hex($id), 'token' => issue_token($pdo, $id)]);
        }

        case 'login.anon': {
            $ref = $in['refCodeHash'] ?? '';
            $pin = $in['pinVerifier'] ?? '';
            if (!is_string($ref) || !preg_match('/^[a-f0-9]{64}$/', $ref) || !is_string($pin) || $pin === '') {
                fail('BAD_REQUEST');
            }
            rate_limit($pdo, $ref);
            $st = $pdo->prepare('SELECT id, pin_hash FROM users WHERE ref_code_hash = ?');
            $st->execute([$ref]);
            $u = $st->fetch();
            if (!$u || !password_verify($pin, (string) $u['pin_hash'])) {
                fail('INVALID_CREDENTIALS', 401);
            }
            rate_limit_clear($pdo, $ref);
            respond(['ok' => true, 'userId' => bin2hex((string) $u['id']), 'token' => issue_token($pdo, (string) $u['id'])]);
        }

        case 'register.email': {
            $email = strtolower(trim((string) ($in['email'] ?? '')));
            $ver = (string) ($in['passwordVerifier'] ?? '');
            $salt = (string) ($in['salt'] ?? '');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $ver === '' || !preg_match('/^[a-f0-9]{32}$/', $salt)) {
                fail('BAD_REQUEST');
            }
            $st = $pdo->prepare('SELECT id FROM users WHERE email = ?');
            $st->execute([$email]);
            if ($st->fetch()) {
                fail('EMAIL_TAKEN', 409);
            }
            $id = uuid16();
            $pdo->prepare('INSERT INTO users (id, mode, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$id, 'email', $email, password_hash($ver, PASSWORD_DEFAULT), $salt, time()]);
            respond(['ok' => true, 'userId' => bin2hex($id), 'salt' => $salt, 'token' => issue_token($pdo, $id)]);
        }

        case 'login.email': {
            $email = strtolower(trim((string) ($in['email'] ?? '')));
            $ver = (string) ($in['passwordVerifier'] ?? '');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $ver === '') {
                fail('BAD_REQUEST');
            }
            rate_limit($pdo, $email);
            $st = $pdo->prepare(
                'SELECT id, password_hash, salt, google_sub FROM users WHERE email = ? AND mode = ?'
            );
            $st->execute([$email, 'email']);
            $u = $st->fetch();
            if (!$u || !password_verify($ver, (string) $u['password_hash'])) {
                fail('INVALID_CREDENTIALS', 401);
            }
            rate_limit_clear($pdo, $email);
            respond([
                'ok' => true,
                'userId' => bin2hex((string) $u['id']),
                'salt' => (string) $u['salt'],
                'googleLinked' => !empty($u['google_sub']),
                'token' => issue_token($pdo, (string) $u['id']),
            ]);
        }

        case 'auth.google': {
            $g = google_identity($pdo, $config, $in);

            // Ya existe una cuenta vinculada a esta identidad de Google.
            $st = $pdo->prepare('SELECT id, mode, email, salt FROM users WHERE google_sub = ?');
            $st->execute([$g['sub']]);
            $u = $st->fetch();
            if ($u) {
                $st = $pdo->prepare('SELECT 1 FROM vaults WHERE user_id = ?');
                $st->execute([$u['id']]);
                respond([
                    'ok' => true,
                    'userId' => bin2hex((string) $u['id']),
                    'email' => (string) $u['email'],
                    'mode' => (string) $u['mode'],
                    'salt' => (string) $u['salt'],
                    'newAccount' => false,
                    'hasVault' => (bool) $st->fetchColumn(),
                    'token' => issue_token($pdo, (string) $u['id']),
                ]);
            }

            // El correo ya tiene cuenta con contraseña: no se vincula solo, la
            // usuaria debe entrar con su contraseña y vincular desde Ajustes.
            $st = $pdo->prepare('SELECT id FROM users WHERE email = ?');
            $st->execute([$g['email']]);
            if ($st->fetch()) {
                fail('EMAIL_EXISTS', 409);
            }

            // Cuenta nueva: el servidor genera el salt PBKDF2 que usará el
            // cliente con el PIN de la bóveda. El PIN no se envía nunca.
            $id = uuid16();
            $salt = bin2hex(random_bytes(16));
            $pdo->prepare(
                'INSERT INTO users (id, mode, email, salt, google_sub, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            )->execute([$id, 'google', $g['email'], $salt, $g['sub'], time()]);
            respond([
                'ok' => true,
                'userId' => bin2hex($id),
                'email' => $g['email'],
                'mode' => 'google',
                'salt' => $salt,
                'newAccount' => true,
                'hasVault' => false,
                'token' => issue_token($pdo, $id),
            ]);
        }

        case 'link.google': {
            $u = auth_user($pdo, $in);
            $g = google_identity($pdo, $config, $in, false);

            if ((string) $u['mode'] !== 'email') {
                // En modo anónimo el salt es el código de referencia (secreto),
                // así que primero hay que vincular un correo.
                fail('GOOGLE_LINK_NEEDS_EMAIL', 409);
            }
            if (!empty($u['google_sub'])) {
                respond(['ok' => true, 'linked' => true]);
            }
            if (strtolower((string) $u['email']) !== $g['email']) {
                fail('GOOGLE_EMAIL_MISMATCH', 409);
            }
            $st = $pdo->prepare('SELECT id FROM users WHERE google_sub = ? AND id <> ?');
            $st->execute([$g['sub'], $u['id']]);
            if ($st->fetch()) {
                fail('GOOGLE_TAKEN', 409);
            }
            $pdo->prepare('UPDATE users SET google_sub = ? WHERE id = ?')
                ->execute([$g['sub'], $u['id']]);
            respond(['ok' => true, 'linked' => true]);
        }

        case 'link.email': {
            $u = auth_user($pdo, $in);
            if ($u['mode'] !== 'anon') {
                fail('ALREADY_LINKED', 409);
            }
            $email = strtolower(trim((string) ($in['email'] ?? '')));
            $ver = (string) ($in['passwordVerifier'] ?? '');
            $salt = (string) ($in['salt'] ?? '');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $ver === '' || !preg_match('/^[a-f0-9]{32}$/', $salt)) {
                fail('BAD_REQUEST');
            }
            $st = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ?');
            $st->execute([$email, $u['id']]);
            if ($st->fetch()) {
                fail('EMAIL_TAKEN', 409);
            }
            $pdo->prepare("UPDATE users SET mode = 'email', email = ?, password_hash = ?, salt = ? WHERE id = ?")
                ->execute([$email, password_hash($ver, PASSWORD_DEFAULT), $salt, $u['id']]);
            respond(['ok' => true, 'linked' => true]);
        }

        case 'vault.get': {
            $u = auth_user($pdo, $in);
            $st = $pdo->prepare('SELECT data_enc, updated_at FROM vaults WHERE user_id = ?');
            $st->execute([$u['id']]);
            $row = $st->fetch();
            respond([
                'ok' => true,
                'data_enc' => $row ? (string) $row['data_enc'] : null,
                // float: seguro hasta 2^53 (el PHP de USBWebServer es 32-bit y (int) desborda).
                'updatedAt' => $row ? (float) $row['updated_at'] : null,
            ]);
        }

        case 'vault.put': {
            $u = auth_user($pdo, $in);
            $enc = $in['data_enc'] ?? null;
            $updatedAt = (float) ($in['updatedAt'] ?? 0);
            $base = (float) ($in['baseUpdatedAt'] ?? 0);
            if (!is_string($enc) || $enc === '' || $updatedAt <= 0) {
                fail('BAD_REQUEST');
            }
            $st = $pdo->prepare('SELECT data_enc, updated_at FROM vaults WHERE user_id = ?');
            $st->execute([$u['id']]);
            $row = $st->fetch();
            if ($row && (float) $row['updated_at'] > $base) {
                // Conflicto: el servidor tiene algo más nuevo → el cliente mezcla y vuelve a subir.
                respond(['ok' => true, 'conflict' => true, 'data_enc' => (string) $row['data_enc'], 'updatedAt' => (float) $row['updated_at']]);
            }
            $pdo->prepare(
                'INSERT INTO vaults (user_id, data_enc, updated_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE data_enc = VALUES(data_enc), updated_at = VALUES(updated_at)'
            )->execute([$u['id'], $enc, (string) $updatedAt]);
            respond(['ok' => true, 'conflict' => false]);
        }

        default:
            fail('UNKNOWN_ACTION', 404);
    }
} catch (PDOException $e) {
    fail('DB_ERROR', 500);
}
