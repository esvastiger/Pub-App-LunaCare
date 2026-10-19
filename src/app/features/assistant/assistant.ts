import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CycleService } from '../../core/cycle.service';
import { fmtMedium, fmtShort, todayISO } from '../../core/date';
import { DIGESTION, DailyLog, MOODS, SYMPTOMS } from '../../core/models';
import { Icon } from '../../shared/ui';

interface ChatMessage {
  id: number;
  role: 'user' | 'bot';
  text: string;
}

/**
 * Asistente de LunaCare.
 *
 * Funciona **100 % en el dispositivo**: no hay ninguna petición de red, así que
 * las respuestas nunca salen del navegador. Se limita a resumir los registros
 * cifrados de la usuaria (medias, tendencias, predicciones ya calculadas) y a
 * ofrecer información general de salud menstrual.
 *
 * Deliberadamente NO diagnostica ni prescribe. Para conectar un modelo de
 * lenguaje real, ver `docs/asistente.md`: la clave debe vivir en el servidor
 * (nunca en el bundle) y conviene seudonimizar el contexto antes de enviarlo.
 */
@Component({
  selector: 'app-assistant',
  imports: [Icon],
  templateUrl: './assistant.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Assistant {
  private readonly cycle = inject(CycleService);
  private readonly insights = this.cycle.insights;

  private seq = 0;

  readonly messages = signal<ChatMessage[]>([
    {
      id: ++this.seq,
      role: 'bot',
      text:
        'Hola 🌙 Soy Luna, tu asistente. Puedo resumir tus registros: duración del ciclo, próxima regla, ventana fértil, síntomas y tendencias. ' +
        'No doy diagnósticos ni recetas, pero te ayudo a entender tus datos y a preparar tu consulta médica.',
    },
  ]);

  readonly draft = signal('');
  readonly thinking = signal(false);

  readonly suggestions = [
    '¿Cuándo me viene la próxima regla?',
    '¿Cuál es mi ventana fértil?',
    '¿Cómo ha sido mi ánimo este mes?',
    '¿Qué síntomas se repiten más?',
    '¿Cómo protege mis datos?',
  ];

  readonly hasData = computed(() => this.insights().hasData);

  private readonly logsList = computed(() => Object.values(this.cycle.logs()));

  send(text?: string): void {
    const raw = (text ?? this.draft()).trim();
    if (!raw || this.thinking()) return;
    this.draft.set('');
    this.messages.update((m) => [...m, { id: ++this.seq, role: 'user', text: raw }]);
    this.thinking.set(true);
    // Pequeña espera para que la respuesta no aparezca de golpe (y se pueda leer).
    setTimeout(() => {
      const answer = this.answer(raw);
      this.messages.update((m) => [...m, { id: ++this.seq, role: 'bot', text: answer }]);
      this.thinking.set(false);
    }, 380);
  }

  onInput(e: Event): void {
    this.draft.set((e.target as HTMLInputElement).value);
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.send();
    }
  }

  clear(): void {
    this.seq = 0;
    this.messages.set([
      {
        id: ++this.seq,
        role: 'bot',
        text: 'Conversación reiniciada. ¿Sobre qué quieres que repasemos tus datos?',
      },
    ]);
  }

  // ——— Motor de respuestas (local, sin red) ———

  private answer(question: string): string {
    const q = normalize(question);

    if (
      matches(q, [
        'urgencia',
        'emergencia',
        'desmayo',
        'fiebre',
        'hemorragia',
        'me muero',
        'sangrado abundante',
      ])
    ) {
      return (
        'Esto puede requerir atención médica inmediata. No puedo valorarlo desde aquí: ' +
        'si tienes sangrado muy abundante (empapas una compresa por hora), desmayos, fiebre alta o dolor insoportable, ' +
        'acude a urgencias o llama a los servicios de emergencia de tu país.\n\n' +
        'Cuando estés bien atendida, puedo ayudarte a repasar tus registros.'
      );
    }

    if (
      matches(q, [
        'privacidad',
        'seguro',
        'datos',
        'cifra',
        'cifrado',
        'nube',
        'servidor',
        'quien ve',
      ])
    ) {
      return (
        'Tus registros se cifran con AES-256-GCM en tu dispositivo y la clave se deriva de tu PIN (PBKDF2, 210.000 iteraciones). ' +
        'Si activas la sincronización, el servidor solo almacena texto cifrado: no puede leer tus notas.\n\n' +
        'Esta conversación no se guarda ni se envía a ningún servicio externo: se calcula en tu navegador.'
      );
    }

    if (!this.hasData()) {
      return (
        'Aún no tengo registros con los que calcular nada. Registra tu último periodo en el panel ' +
        'y en cuanto haya unos días de datos podré resumir tu ciclo, tus síntomas y tus tendencias.'
      );
    }

    if (matches(q, ['proxima', 'proximo', 'cuando', 'regla', 'periodo', 'menstruacion', 'viene'])) {
      const i = this.insights();
      if (!i.nextStart)
        return 'Todavía no puedo estimar la próxima regla: necesito al menos una fecha de inicio de periodo.';
      const d = i.daysUntilNext ?? 0;
      const when =
        d === 0
          ? 'es hoy'
          : d < 0
            ? `llegó hace ${Math.abs(d)} días según la estimación`
            : `en ${d} ${d === 1 ? 'día' : 'días'}`;
      return (
        `Tu próxima regla está estimada para el ${fmtMedium(i.nextStart)} (${when}).\n\n` +
        `Basado en un ciclo medio de ${i.avgCycle} días y ${i.cyclesCount} ${i.cyclesCount === 1 ? 'periodo registrado' : 'periodos registrados'}. ` +
        'Las estimaciones se ajustan a medida que registras más días.'
      );
    }

    if (matches(q, ['fertil', 'ovulacion', 'ovulo', 'embarazo', 'concebir'])) {
      const i = this.insights();
      if (!i.fertileStart || !i.fertileEnd)
        return 'Necesito al menos un periodo registrado para estimar tu ventana fértil.';
      const ovu = i.ovulationDate
        ? ` La ovulación estimada es el ${fmtMedium(i.ovulationDate)}.`
        : '';
      return (
        `Tu ventana fértil estimada va del ${fmtMedium(i.fertileStart)} al ${fmtMedium(i.fertileEnd)}.${ovu}\n\n` +
        'Es una estimación estadística, no un método anticonceptivo: no la uses como protección ni como prueba de fertilidad.'
      );
    }

    if (matches(q, ['sintoma', 'sintomas', 'repetir', 'frecuente', 'dolor', 'cabeza', 'nausea'])) {
      const top = this.topSymptoms();
      if (!top.length)
        return 'No tengo síntomas marcados en tus registros todavía. Puedes añadirlos desde «Registrar día».';
      return (
        'Tus síntomas más frecuentes registrados son:\n' +
        top
          .map(
            (s, idx) =>
              `${idx + 1}. ${s.emoji} ${s.label} — ${s.count} ${s.count === 1 ? 'día' : 'días'}`,
          )
          .join('\n') +
        '\n\nSi alguno aparece siempre en la misma fase, puede ayudarte a comentarlo con tu médico.'
      );
    }

    if (matches(q, ['animo', 'estado', 'emocional', 'triste', 'ansiedad', 'humor'])) {
      const avg = this.avgOf((l) => l.moodScale);
      const mood = this.topMood();
      if (avg == null)
        return 'Aún no has registrado tu estado de ánimo. Puedes hacerlo con la escala 0–10 en «Registrar día».';
      const extra = mood
        ? ` El estado que más repites es «${mood.label}» (${mood.count} ${mood.count === 1 ? 'día' : 'días'}).`
        : '';
      return `Tu ánimo medio registrado es ${avg.toFixed(1)}/10.${extra}`;
    }

    if (matches(q, ['sueno', 'dormir', 'descanso', 'insomnio'])) {
      const avg = this.avgOf((l) => l.sleep);
      if (avg == null) return 'No tengo registros de sueño todavía.';
      const verdict =
        avg >= 7
          ? 'estás descansando bien'
          : avg >= 5
            ? 'tu descanso es aceptable, con margen de mejora'
            : 'tu descanso está siendo bajo';
      return `Tu calidad de sueño media es ${avg.toFixed(1)}/10: ${verdict}.`;
    }

    if (matches(q, ['libido', 'deseo', 'sexual'])) {
      const avg = this.avgOf((l) => l.libido);
      if (avg == null) return 'Aún no has registrado libido.';
      return `Tu libido media registrada es ${avg.toFixed(1)}/10. Suele variar con la fase del ciclo y el estrés, así que la tendencia importa más que el valor suelto.`;
    }

    if (matches(q, ['flujo', 'sangrado', 'sangre', 'duracion'])) {
      const i = this.insights();
      if (!i.avgPeriod) return 'No tengo suficientes días de sangrado registrados.';
      const normal = i.avgPeriod >= 3 && i.avgPeriod <= 7;
      return (
        `Tu sangrado medio dura ${i.avgPeriod} ${i.avgPeriod === 1 ? 'día' : 'días'}.\n\n` +
        (normal
          ? 'Está dentro del rango habitual (3–7 días).'
          : 'Queda fuera del rango considerado habitual (3–7 días); si se repite varios ciclos, conviene comentarlo con tu médico.')
      );
    }

    if (matches(q, ['ciclo', 'media', 'duracion ciclo', 'regular', 'variabilidad', 'irregular'])) {
      const i = this.insights();
      const varText =
        i.variability === 0
          ? 'Aún no hay dos ciclos completos para medir la variabilidad.'
          : `Tu variabilidad es de ±${i.variability} días: ${i.variability <= 3 ? 'regular' : i.variability <= 7 ? 'algo variable' : 'irregular'}.`;
      return `Tu ciclo medio es de ${i.avgCycle} días, con ${i.cyclesCount} ${i.cyclesCount === 1 ? 'periodo registrado' : 'periodos registrados'}.\n\n${varText}`;
    }

    if (matches(q, ['temperatura', 'bbt', 'basal'])) {
      const last = this.lastWith((l) => l.bbt);
      if (!last) return 'No tengo temperaturas basales registradas.';
      return `Tu última temperatura basal registrada fue ${String(last.bbt).replace('.', ',')} °C el ${fmtShort(last.date)}. Para ver el patrón de ovulación necesitas medirla varios días seguidos al despertar.`;
    }

    if (matches(q, ['digestion', 'estomago', 'hinchazon', 'estreñimiento'])) {
      const counts = new Map<string, number>();
      for (const l of this.logsList())
        if (l.digestion) counts.set(l.digestion, (counts.get(l.digestion) ?? 0) + 1);
      if (!counts.size) return 'No tengo registros de digestión todavía.';
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const label = DIGESTION.find((d) => d.id === top[0])?.label ?? top[0];
      return `Lo que más has registrado en digestión es «${label}», en ${top[1]} ${top[1] === 1 ? 'día' : 'días'}.`;
    }

    if (matches(q, ['resumen', 'como voy', 'todo', 'general', 'ayuda', 'que puedes'])) {
      return this.summary();
    }

    return (
      'No estoy segura de haber entendido. Puedo responder sobre:\n' +
      '• Duración y regularidad de tu ciclo\n' +
      '• Próxima regla y ventana fértil\n' +
      '• Síntomas, ánimo, sueño, libido, digestión y temperatura\n' +
      '• Privacidad y cifrado de tus datos\n\n' +
      'Prueba con una de las sugerencias de abajo.'
    );
  }

  private summary(): string {
    const i = this.insights();
    const parts: string[] = [];
    if (i.avgCycle) parts.push(`Ciclo medio: ${i.avgCycle} días`);
    if (i.avgPeriod) parts.push(`Sangrado medio: ${i.avgPeriod} días`);
    if (i.nextStart) parts.push(`Próxima regla: ${fmtMedium(i.nextStart)}`);
    if (i.fertileStart && i.fertileEnd)
      parts.push(`Ventana fértil: ${fmtMedium(i.fertileStart)} – ${fmtMedium(i.fertileEnd)}`);
    if (i.cycleDayToday) parts.push(`Hoy es el día ${i.cycleDayToday} de tu ciclo`);
    const top = this.topSymptoms();
    if (top.length) parts.push(`Síntoma más frecuente: ${top[0].label}`);
    return (
      `Resumen de tus datos (hoy ${fmtShort(todayISO())}):\n\n` +
      parts.map((p) => `• ${p}`).join('\n')
    );
  }

  private topSymptoms(): { id: string; label: string; emoji: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const l of this.logsList())
      for (const s of l.symptoms) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => {
        const item = SYMPTOMS.find((s) => s.id === id);
        if (!item) return null;
        const log = this.logsList().find((l) => l.symptoms.includes(id));
        const label = id === 'other' && log?.symptomsOther ? log.symptomsOther : item.label;
        return { id, label, emoji: item.emoji, count };
      })
      .filter((s): s is { id: string; label: string; emoji: string; count: number } => !!s)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  private topMood(): { label: string; count: number } | null {
    const counts = new Map<string, number>();
    for (const l of this.logsList()) if (l.mood) counts.set(l.mood, (counts.get(l.mood) ?? 0) + 1);
    if (!counts.size) return null;
    const [id, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const label = MOODS.find((m) => m.id === id)?.label ?? id;
    return { label, count };
  }

  private avgOf(pick: (l: DailyLog) => number | null): number | null {
    const values = this.logsList()
      .map(pick)
      .filter((v): v is number => typeof v === 'number');
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private lastWith(pick: (l: DailyLog) => number | null): DailyLog | null {
    const list = this.logsList()
      .filter((l) => pick(l) != null)
      .sort((a, b) => b.date.localeCompare(a.date));
    return list[0] ?? null;
  }
}

/** Normaliza para comparar: minúsculas y sin acentos. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matches(q: string, words: string[]): boolean {
  return words.some((w) => q.includes(normalize(w)));
}
