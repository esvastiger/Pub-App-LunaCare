<?php
/**
 * Configuración de la API de LunaCare.
 *
 * ESTE ARCHIVO SE VERSIONA: no pongas credenciales reales aquí.
 *
 * Precedencia (de menor a mayor):
 *   1. Valores por defecto de desarrollo (USBWebServer: root / usbw).
 *   2. Variables de entorno: LUNACARE_DB_HOST, LUNACARE_DB_PORT, LUNACARE_DB_NAME,
 *      LUNACARE_DB_USER, LUNACARE_DB_PASS, LUNACARE_TOKEN_DAYS, LUNACARE_CORS_ORIGIN,
 *      LUNACARE_GOOGLE_CLIENT_ID.
 *   3. `config.local.php` (ignorado por git): copia `config.example.php` y ajústalo.
 *
 * En producción sirve la API por HTTPS y restringe `cors_origin` a tu dominio.
 */
declare(strict_types=1);

$env = static function (string $key) {
    $value = getenv($key);
    return $value === false || $value === '' ? null : $value;
};

$config = [
    'db' => [
        'host' => $env('LUNACARE_DB_HOST') ?? '127.0.0.1',
        'port' => (int) ($env('LUNACARE_DB_PORT') ?? 3306),
        'name' => $env('LUNACARE_DB_NAME') ?? 'lunacare',
        'user' => $env('LUNACARE_DB_USER') ?? 'root',
        'pass' => $env('LUNACARE_DB_PASS') ?? 'usbw',
    ],
    // Días de validez de los tokens de sesión.
    'token_days' => (int) ($env('LUNACARE_TOKEN_DAYS') ?? 30),
    // Origen permitido por CORS. '*' solo vale para desarrollo local.
    'cors_origin' => $env('LUNACARE_CORS_ORIGIN') ?? '*',
    // Inicio de sesión con Google (opcional). Es el Client ID público del
    // proyecto de Google Cloud; vacío = la función queda desactivada y la app
    // muestra un aviso. El client secret NO se usa: el token lo firma Google
    // y aquí solo se verifica.
    'google' => [
        'client_id' => $env('LUNACARE_GOOGLE_CLIENT_ID') ?? '',
    ],
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $override = require $local;
    if (is_array($override)) {
        $config = array_replace_recursive($config, $override);
    }
}

return $config;
