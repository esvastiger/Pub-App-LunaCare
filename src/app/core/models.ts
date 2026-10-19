/** Catálogos y tipos de datos de LunaCare. */

export type FlowLevel = 'none' | 'spotting' | 'light' | 'medium' | 'heavy';

export const FLOWS: { id: FlowLevel; label: string; emoji: string }[] = [
  { id: 'none', label: 'Ninguno', emoji: '🚫' },
  { id: 'spotting', label: 'Manchado', emoji: '💧' },
  { id: 'light', label: 'Ligero', emoji: '🌤️' },
  { id: 'medium', label: 'Medio', emoji: '🌊' },
  { id: 'heavy', label: 'Abundante', emoji: '🌧️' },
];

export type Intensity = 'none' | 'mild' | 'moderate' | 'severe';

/** Escala compartida por dolor y sensibilidad mamaria. */
export const INTENSITIES: { id: Intensity; label: string }[] = [
  { id: 'none', label: 'Ninguno' },
  { id: 'mild', label: 'Leve' },
  { id: 'moderate', label: 'Moderado' },
  { id: 'severe', label: 'Severo' },
];

export type StressLevel = 'low' | 'medium' | 'high';

export const STRESS: { id: StressLevel; label: string; emoji: string }[] = [
  { id: 'low', label: 'Bajo', emoji: '😌' },
  { id: 'medium', label: 'Medio', emoji: '😐' },
  { id: 'high', label: 'Alto', emoji: '😣' },
];

export type CervicalMucus = 'dry' | 'sticky' | 'creamy' | 'eggwhite';

export const MUCUS: { id: CervicalMucus; label: string; emoji: string }[] = [
  { id: 'dry', label: 'Seco', emoji: '🏜️' },
  { id: 'sticky', label: 'Pegajoso', emoji: '🍯' },
  { id: 'creamy', label: 'Cremoso', emoji: '🥛' },
  { id: 'eggwhite', label: 'Clara de huevo', emoji: '🥚' },
];

export type CervixHeight = 'low' | 'medium' | 'high';

export const CERVIX_HEIGHT: { id: CervixHeight; label: string }[] = [
  { id: 'low', label: 'Baja' },
  { id: 'medium', label: 'Media' },
  { id: 'high', label: 'Alta' },
];

export type CervixOpening = 'closed' | 'medium' | 'open';

export const CERVIX_OPENING: { id: CervixOpening; label: string }[] = [
  { id: 'closed', label: 'Cerrado' },
  { id: 'medium', label: 'Medio' },
  { id: 'open', label: 'Abierto' },
];

export type CervixFirmness = 'firm' | 'medium' | 'soft';

export const CERVIX_FIRMNESS: { id: CervixFirmness; label: string }[] = [
  { id: 'firm', label: 'Firme' },
  { id: 'medium', label: 'Medio' },
  { id: 'soft', label: 'Blando' },
];

export type DigestionState = 'normal' | 'bloating' | 'constipation' | 'diarrhea' | 'other';

export const DIGESTION: { id: DigestionState; label: string; emoji: string }[] = [
  { id: 'normal', label: 'Normal', emoji: '✅' },
  { id: 'bloating', label: 'Hinchazón', emoji: '🎈' },
  { id: 'constipation', label: 'Estreñimiento', emoji: '🚽' },
  { id: 'diarrhea', label: 'Diarrea', emoji: '💨' },
  { id: 'other', label: 'Otros', emoji: '✍️' },
];

export type SkinState = 'clear' | 'oily' | 'dry' | 'acne';

export const SKIN: { id: SkinState; label: string; emoji: string }[] = [
  { id: 'clear', label: 'Limpia', emoji: '✨' },
  { id: 'oily', label: 'Grasa', emoji: '💧' },
  { id: 'dry', label: 'Seca', emoji: '🍂' },
  { id: 'acne', label: 'Acné', emoji: '🔴' },
];

export type AlcoholLevel = 'none' | 'light' | 'moderate' | 'heavy';

export const ALCOHOL: { id: AlcoholLevel; label: string; emoji: string }[] = [
  { id: 'none', label: 'Nada', emoji: '🚫' },
  { id: 'light', label: 'Poco', emoji: '🍹' },
  { id: 'moderate', label: 'Moderado', emoji: '🍷' },
  { id: 'heavy', label: 'Mucho', emoji: '🍸' },
];

export const BBT_MIN = 35;
export const BBT_MAX = 42;

export const SYMPTOMS: { id: string; label: string; emoji: string }[] = [
  { id: 'cramps', label: 'Calambres', emoji: '⚡' },
  { id: 'headache', label: 'Cabeza', emoji: '🤕' },
  { id: 'bloating', label: 'Hinchazón', emoji: '🎈' },
  { id: 'breast', label: 'Pecho sensible', emoji: '🌸' },
  { id: 'acne', label: 'Acné', emoji: '🔴' },
  { id: 'fatigue', label: 'Fatiga', emoji: '🥱' },
  { id: 'cravings', label: 'Antojos', emoji: '🍫' },
  { id: 'nausea', label: 'Náuseas', emoji: '🤢' },
  { id: 'insomnia', label: 'Insomnio', emoji: '🌙' },
  { id: 'backpain', label: 'Lumbar', emoji: '🦴' },
  { id: 'dizziness', label: 'Mareo', emoji: '💫' },
  { id: 'digestion', label: 'Digestión', emoji: '🚽' },
  { id: 'other', label: 'Otros', emoji: '✍️' },
];

/** Puntuación 0–10 de cada estado de ánimo (para la escala derivada). */
export const MOOD_SCORES: Record<string, number> = {
  energetic: 10,
  happy: 9,
  calm: 7,
  sensitive: 5,
  tired: 4,
  irritable: 3,
  anxious: 2,
  sad: 1,
};

export const MOODS: { id: string; label: string; emoji: string }[] = [
  { id: 'happy', label: 'Feliz', emoji: '😊' },
  { id: 'calm', label: 'Tranquila', emoji: '😌' },
  { id: 'sensitive', label: 'Sensible', emoji: '🥺' },
  { id: 'irritable', label: 'Irritable', emoji: '😤' },
  { id: 'anxious', label: 'Ansiosa', emoji: '😰' },
  { id: 'sad', label: 'Triste', emoji: '😢' },
  { id: 'energetic', label: 'Con energía', emoji: '⚡' },
  { id: 'tired', label: 'Cansada', emoji: '😴' },
];

export interface CycleSettings {
  /** Inicio del último periodo conocido (ISO yyyy-MM-dd). */
  lastPeriodStart: string | null;
  cycleLength: number;
  periodLength: number;
  onboarded: boolean;
}

export interface DailyLog {
  date: string; // ISO yyyy-MM-dd
  flow: FlowLevel | null;
  symptoms: string[];
  mood: string | null;
  /** Escala de ánimo 0–10 elegida en el scroll (respaldo del estado cualitativo). */
  moodScale: number | null;
  note: string;
  // — Registro ampliado (v2) —
  pain: Intensity | null;
  libido: number | null; // 0–10
  sleep: number | null; // 0–10
  stress: StressLevel | null;
  bbt: number | null; // °C (35–42)
  mucus: CervicalMucus | null;
  cervixHeight: CervixHeight | null;
  cervixOpening: CervixOpening | null;
  cervixFirmness: CervixFirmness | null;
  breast: Intensity | null;
  digestion: DigestionState | null;
  /** Texto libre cuando `digestion === 'other'`. Opcional por compatibilidad. */
  digestionOther?: string;
  /** Texto libre cuando `symptoms` incluye 'other'. Opcional por compatibilidad. */
  symptomsOther?: string;
  skin: SkinState | null;
  alcohol: AlcoholLevel | null;
  meds: string;
  updatedAt: number;
}

/** ¿Hay algo registrado en este día? (punto del calendario, resúmenes…). */
export function hasAnyLogData(l: DailyLog | undefined): boolean {
  if (!l) return false;
  return !!(
    l.flow ||
    l.mood ||
    l.note ||
    l.symptoms.length ||
    l.pain ||
    l.libido != null ||
    l.sleep != null ||
    l.stress ||
    l.bbt != null ||
    l.mucus ||
    l.cervixHeight ||
    l.cervixOpening ||
    l.cervixFirmness ||
    l.breast ||
    l.digestion ||
    l.digestionOther ||
    l.symptomsOther ||
    l.skin ||
    l.alcohol ||
    l.meds
  );
}

/** Bóveda cifrada: única estructura que se guarda localmente y se sincroniza. */
export interface VaultData {
  version: number;
  settings: CycleSettings;
  logs: Record<string, DailyLog>;
  updatedAt: number;
}

export type AuthMode = 'anonymous' | 'email' | 'google';

export interface Session {
  userId: string;
  mode: AuthMode;
  /** Solo modo anónimo: código en claro (nunca se envía al servidor en claro). */
  refCode: string | null;
  email: string | null;
  createdAt: number;
  /** La cuenta acepta también inicio de sesión con Google (vinculado en el servidor). */
  googleLinked?: boolean;
}

export function emptyVault(): VaultData {
  return {
    version: 1,
    settings: { lastPeriodStart: null, cycleLength: 28, periodLength: 5, onboarded: false },
    logs: {},
    updatedAt: 0,
  };
}
