<?php
/**
 * Plantilla de configuración local.
 *
 *   cp backend/api/config.example.php backend/api/config.local.php
 *
 * `config.local.php` está en .gitignore: ahí sí puedes poner credenciales.
 * Cualquier clave que omitas cae en la variable de entorno correspondiente o en
 * el valor por defecto de `config.php`.
 */
declare(strict_types=1);

return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'lunacare',
        'user' => 'root',
        'pass' => 'usbw',
    ],
    'token_days' => 30,
    // En producción: 'https://tu-dominio.example' (nunca '*').
    'cors_origin' => '*',
    // Inicio de sesión con Google (opcional). Pega el Client ID de tipo
    // "Web application" creado en Google Cloud Console. No hace falta el
    // client secret. Vacío = desactivado.
    'google' => [
        'client_id' => '',
    ],
];
