import { Component, Input } from '@angular/core';

/** #91: bloques que ocupan el lugar de una lista o tarjeta mientras llegan los datos. */
@Component({
  selector: 'app-skeleton',
  template: `<div class="skeleton" *ngFor="let _ of bloques" [style.height.px]="alto"></div>`,
  styleUrls: ['./skeleton.component.scss'],
  host: { role: 'status', 'aria-label': 'Cargando', 'aria-busy': 'true' }
})
export class SkeletonComponent {
  @Input() filas = 4;
  @Input() alto = 48;

  get bloques(): unknown[] {
    return Array(this.filas);
  }
}
