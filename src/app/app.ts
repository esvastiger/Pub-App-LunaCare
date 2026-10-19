import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './shared/ui';

@Component({
  imports: [RouterOutlet, Toasts],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /> <app-toasts />`,
})
export class App {}
