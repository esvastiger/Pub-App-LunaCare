# Asistente Luna · arquitectura y cómo conectar un LLM real

## Estado actual (sin coste y sin fuga de datos)

`src/app/features/assistant/` implementa un asistente **100 % local**:

- No hay ninguna petición de red. La conversación vive en memoria (`signal`).
- Las respuestas se calculan con `CycleService.insights()` y los registros ya
  descifrados en el cliente: medias de ciclo, próxima regla, ventana fértil,
  síntomas frecuentes, ánimo, sueño, libido, digestión, BBT.
- Incluye salvaguardas: si el mensaje menciona sangrado abundante, desmayo,
  fiebre o emergencia, responde derivando a urgencias en lugar de "opinar".
- Nunca diagnostica ni prescribe; el aviso está visible de forma permanente.

Motivo de este diseño: los datos de salud menstrual son categoría especial.
Enviarlos a un tercero exige base legal, contrato de encargado de tratamiento y
seudonimización. Un resumen local cubre la mayoría de consultas sin ese coste.

## Si se quiere un modelo de lenguaje real

1. **La clave nunca en el cliente.** El bundle de Angular es público: una clave
   ahí queda expuesta en minutos. Debe vivir en el backend PHP
   (`backend/api/config.php` leída de variable de entorno) y el frontend llamar
   a un endpoint propio, p. ej. `POST index.php?action=chat`.
2. **Seudonimizar el contexto.** No envíes notas libres ni fechas exactas.
   Envía un resumen agregado: `{avgCycle, avgPeriod, phaseToday, topSymptoms}`.
   Las notas personales cifradas no deben salir del dispositivo.
3. **Minimizar y no entrenar.** Elegir un proveedor con retención cero y sin
   entrenamiento sobre las entradas; documentarlo en la política de privacidad.
4. **Límite de uso por usuario y por IP** (el `rate_limit()` del backend ya
   sirve de base) para evitar abuso y costes.
5. **Streaming**: si se activa, usar SSE desde el endpoint PHP y no exponer el
   token del proveedor al navegador.
6. **Consentimiento explícito** antes del primer envío a terceros, con opción a
   seguir usando solo el modo local.

> Nota: el índice de servicios consultado no ofrece un proveedor de LLM con
> garantías verificables de "sin entrenamiento" para datos de salud, así que la
> elección de proveedor queda pendiente de decisión explícita del responsable.

## Punto de extensión en el código

`Assistant.answer()` es el único punto que decide la respuesta. Para usar un
modelo remoto: intentar primero el endpoint; si responde `offline` o error,
caer al motor local actual. Así la app nunca se queda sin asistente.
