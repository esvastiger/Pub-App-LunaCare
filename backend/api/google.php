<?php
/**
 * Verificación de ID tokens de Google ("Sign in with Google") sin Composer.
 *
 * El frontend obtiene el token con Google Identity Services y lo envía a
 * `index.php?action=auth.google`. Aquí se valida la firma RS256 contra las
 * claves públicas de Google y las claims (`iss`, `aud`, `exp`, `email_verified`).
 *
 * Lo único que llega al servidor es el token firmado por Google, que Google ya
 * emitió: la contraseña o el PIN de la usuaria NUNCA se envían.
 *
 * Si el token es válido, se devuelve su identidad. Cualquier fallo lanza
 * `RuntimeException` con un código corto que el enrutador traduce a JSON.
 */
declare(strict_types=1);

const LUNACARE_GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const LUNACARE_GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const LUNACARE_GOOGLE_JWKS_TTL = 3600;

/** Base64url → binario. */
function google_b64url_decode(string $input): string
{
    $padded = strtr($input, '-_', '+/');
    $rest = strlen($padded) % 4;
    if ($rest > 0) {
        $padded .= str_repeat('=', 4 - $rest);
    }
    $decoded = base64_decode($padded, true);
    return $decoded === false ? '' : $decoded;
}

/**
 * Claves públicas de Google (JWKS), con caché en disco de 1 hora para no
 * llamar a Google en cada inicio de sesión.
 *
 * @return array{keys: list<array<string, string>>}
 */
function google_jwks(
    string $url = LUNACARE_GOOGLE_JWKS_URL,
    ?string $cacheFile = null,
    bool $refresh = false
): array {
    $cacheFile ??= sys_get_temp_dir() . '/lunacare-google-jwks.json';

    if (!$refresh && is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < LUNACARE_GOOGLE_JWKS_TTL) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached) && !empty($cached['keys'])) {
            return $cached;
        }
    }

    $raw = null;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (is_string($body) && $status === 200) {
            $raw = $body;
        }
    }
    if ($raw === null) {
        $ctx = stream_context_create([
            'http' => ['timeout' => 6, 'header' => "Accept: application/json\r\n"],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        if (is_string($body) && $body !== '') {
            $raw = $body;
        }
    }

    if ($raw === null) {
        throw new RuntimeException('GOOGLE_KEYS_UNAVAILABLE');
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || empty($data['keys']) || !is_array($data['keys'])) {
        throw new RuntimeException('GOOGLE_KEYS_INVALID');
    }

    // Caché best-effort: si el directorio temporal no es escribible, seguimos.
    @file_put_contents($cacheFile, $raw, LOCK_EX);

    return $data;
}

/** Longitud DER (ASN.1). */
function google_der_len(int $len): string
{
    if ($len < 0x80) {
        return chr($len);
    }
    $bytes = '';
    while ($len > 0) {
        $bytes = chr($len & 0xff) . $bytes;
        $len >>= 8;
    }
    return chr(0x80 | strlen($bytes)) . $bytes;
}

/** TLV ASN.1. */
function google_der_tlv(int $tag, string $payload): string
{
    return chr($tag) . google_der_len(strlen($payload)) . $payload;
}

/** INTEGER DER con signo positivo (re-antepone 0x00 si el bit alto está puesto). */
function google_der_int(string $bytes): string
{
    $bytes = ltrim($bytes, "\x00");
    if ($bytes === '') {
        $bytes = "\x00";
    }
    if (ord($bytes[0]) & 0x80) {
        $bytes = "\x00" . $bytes;
    }
    return google_der_tlv(0x02, $bytes);
}

/**
 * Convierte una JWK RSA (n, e) a una clave PEM `PUBLIC KEY` (SPKI), que es lo
 * que entiende openssl_verify sin extensiones adicionales.
 */
function google_rsa_public_pem(array $jwk): string
{
    $modulus = google_b64url_decode((string) ($jwk['n'] ?? ''));
    $exponent = google_b64url_decode((string) ($jwk['e'] ?? ''));
    if ($modulus === '' || $exponent === '') {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }

    $rsaKey = google_der_tlv(0x30, google_der_int($modulus) . google_der_int($exponent));
    // OID 1.2.840.113549.1.1.1 (rsaEncryption) + NULL
    $algorithm = google_der_tlv(
        0x30,
        google_der_tlv(0x06, "\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01") . google_der_tlv(0x05, '')
    );
    $spki = google_der_tlv(0x30, $algorithm . google_der_tlv(0x03, "\x00" . $rsaKey));

    return "-----BEGIN PUBLIC KEY-----\n"
        . chunk_split(base64_encode($spki), 64, "\n")
        . "-----END PUBLIC KEY-----\n";
}

/**
 * Valida un ID token de Google.
 *
 * @param array|null $jwks Claves ya cargadas (tests offline). null = descarga/caché.
 * @return array{sub: string, email: string, name: string, picture: string}
 * @throws RuntimeException con código corto (GOOGLE_*)
 */
function verify_google_id_token(string $idToken, string $clientId, ?array $jwks = null): array
{
    if ($clientId === '') {
        throw new RuntimeException('GOOGLE_NOT_CONFIGURED');
    }

    $parts = explode('.', $idToken);
    if (count($parts) !== 3) {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }

    $header = json_decode(google_b64url_decode($parts[0]), true);
    $claims = json_decode(google_b64url_decode($parts[1]), true);
    if (!is_array($header) || !is_array($claims)) {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }
    if (($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }

    $injectedKeys = $jwks !== null;
    if ($jwks === null) {
        $jwks = google_jwks();
    }

    $jwk = null;
    foreach ($jwks['keys'] ?? [] as $candidate) {
        if (is_array($candidate) && ($candidate['kid'] ?? '') === $header['kid']) {
            $jwk = $candidate;
            break;
        }
    }
    // Rotación de claves: si el `kid` no está en la caché, se refresca una vez.
    if ($jwk === null && !$injectedKeys) {
        $jwks = google_jwks(LUNACARE_GOOGLE_JWKS_URL, null, true);
        foreach ($jwks['keys'] ?? [] as $candidate) {
            if (is_array($candidate) && ($candidate['kid'] ?? '') === $header['kid']) {
                $jwk = $candidate;
                break;
            }
        }
    }
    if (!is_array($jwk)) {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }

    $signatureOk = openssl_verify(
        $parts[0] . '.' . $parts[1],
        google_b64url_decode($parts[2]),
        google_rsa_public_pem($jwk),
        OPENSSL_ALGO_SHA256
    );
    if ($signatureOk !== 1) {
        throw new RuntimeException('GOOGLE_TOKEN_SIGNATURE');
    }

    $now = time();
    if (!in_array((string) ($claims['iss'] ?? ''), LUNACARE_GOOGLE_ISSUERS, true)) {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }

    $audience = $claims['aud'] ?? '';
    $audiences = is_array($audience) ? $audience : [$audience];
    if (!in_array($clientId, $audiences, true)) {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }
    if (count($audiences) > 1 && ($claims['azp'] ?? '') !== $clientId) {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }

    // 60 s de margen por desfase de reloj (el servidor local puede ir atrasado).
    if ((int) ($claims['exp'] ?? 0) <= $now - 60) {
        throw new RuntimeException('GOOGLE_TOKEN_EXPIRED');
    }
    if (isset($claims['iat']) && (int) $claims['iat'] > $now + 300) {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }

    $email = strtolower(trim((string) ($claims['email'] ?? '')));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('GOOGLE_NO_EMAIL');
    }
    if (!filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
        throw new RuntimeException('GOOGLE_EMAIL_UNVERIFIED');
    }

    $sub = (string) ($claims['sub'] ?? '');
    if ($sub === '') {
        throw new RuntimeException('GOOGLE_TOKEN_INVALID');
    }

    return [
        'sub' => $sub,
        'email' => $email,
        'name' => (string) ($claims['name'] ?? ''),
        'picture' => (string) ($claims['picture'] ?? ''),
    ];
}
