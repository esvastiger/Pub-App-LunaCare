@echo off
REM ============================================================
REM  LunaCare · Servidor de la API en desarrollo (PHP built-in)
REM  Usa el PHP incluido en tu USBWebServer (E:\usbwebserver)
REM  API disponible en: http://localhost:8090
REM ============================================================

set PHP=E:\usbwebserver\php\php.exe
if not exist "%PHP%" set PHP=php

echo Iniciando LunaCare API en http://localhost:8090 ...
"%PHP%" -S 0.0.0.0:8090 -t "%~dp0api"
