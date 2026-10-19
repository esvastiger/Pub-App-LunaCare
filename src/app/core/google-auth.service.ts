import { Injectable } from '@angular/core';

/**
 * Puente con Google Identity Services (GIS).
 *
 * Privacidad: el script de Google **no se carga al abrir la app**, solo cuando
 * la usuaria pulsa «Continuar con Google». Hasta ese momento ningún dato sale
 * hacia Google. El Client ID se lee de `<meta name="google-client-id">`, que es
 * público por diseño (no es un secreto).
 *
 * Se usa el **botón oficial** de GIS (`renderButton`) en lugar de One Tap: el
 * botón abre el selector de cuentas y, si el navegador no tiene ninguna sesión
 * de Google, permite iniciar sesión. One Tap no se muestra en ese caso (FedCM
 * devuelve una lista de cuentas vacía), que es el fallo que veíamos antes.
 *
 * Lo que devuelve GIS es un *ID token* firmado por Google; el backend lo
 * verifica y jamás ve el PIN ni la contraseña de la bóveda.
 */

export type GoogleMountResult = { ok: true } | { ok: false; error: string };

interface GsiCredentialResponse {
  credential?: string;
}

interface GsiButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
}

interface GsiId {
  initialize(config: {
    client_id: string;
    callback: (response: GsiCredentialResponse) => void;
    auto_select?: boolean;
    ux_mode?: 'popup' | 'redirect';
  }): void;
  renderButton(parent: HTMLElement, options: GsiButtonOptions): void;
  disableAutoSelect?(): void;
}

interface GoogleWindow {
  google?: { accounts?: { id?: GsiId } };
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const META_NAME = 'google-client-id';

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private scriptPromise: Promise<void> | null = null;
  private clientIdCache: string | null = null;

  /** Client ID configurado ('' = inicio con Google desactivado). */
  clientId(): string {
    if (this.clientIdCache === null) {
      const meta = document.querySelector(`meta[name="${META_NAME}"]`);
      this.clientIdCache = (meta?.getAttribute('content') ?? '').trim();
    }
    return this.clientIdCache;
  }

  get configured(): boolean {
    return this.clientId() !== '';
  }

  /**
   * Carga GIS y pinta el botón oficial dentro de `parent`. Debe llamarse desde
   * un gesto del usuario (clic). `onCredential` recibe el ID token cuando la
   * usuaria elige su cuenta en el diálogo de Google.
   *
   * El contenedor se vacía antes de montar, para poder reintentar sin duplicar.
   */
  async mountButton(
    parent: HTMLElement,
    onCredential: (credential: string) => void,
  ): Promise<GoogleMountResult> {
    if (!this.configured) {
      return {
        ok: false,
        error:
          'El inicio con Google aún no está configurado. Añade tu Client ID en el meta google-client-id.',
      };
    }

    try {
      await this.loadScript();
    } catch {
      return {
        ok: false,
        error: 'No pudimos cargar Google. Revisa tu conexión o usa correo y contraseña.',
      };
    }

    const gsi = (window as unknown as GoogleWindow).google?.accounts?.id;
    if (!gsi) {
      return {
        ok: false,
        error: 'Google no está disponible en este navegador. Usa correo y contraseña.',
      };
    }

    try {
      parent.replaceChildren();
      gsi.initialize({
        client_id: this.clientId(),
        ux_mode: 'popup',
        auto_select: false,
        callback: (response) => {
          if (response?.credential) onCredential(response.credential);
        },
      });
      // GIS exige entre 200 y 400 px: se adapta al ancho real de la tarjeta.
      const available = parent.clientWidth || 300;
      gsi.renderButton(parent, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'center',
        width: Math.max(200, Math.min(300, Math.floor(available))),
      });
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'No se pudo mostrar el botón de Google. Inténtalo de nuevo.',
      };
    }
  }

  /**
   * Carga el script de GIS una sola vez y de forma diferida.
   * Si falla, se permite reintentar en el siguiente clic.
   */
  private loadScript(): Promise<void> {
    if (this.scriptPromise) return this.scriptPromise;

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        if (existing.dataset['loaded'] === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('gis-load')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset['loaded'] = '0';
      script.addEventListener(
        'load',
        () => {
          script.dataset['loaded'] = '1';
          resolve();
        },
        { once: true },
      );
      script.addEventListener(
        'error',
        () => {
          script.remove();
          reject(new Error('gis-load'));
        },
        { once: true },
      );
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      // Permite reintentar: un fallo de red no debe bloquear el botón para siempre.
      this.scriptPromise = null;
      throw error;
    });

    return this.scriptPromise;
  }
}
