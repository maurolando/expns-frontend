import { Directive, ElementRef, Inject, Input, LOCALE_ID, OnDestroy } from '@angular/core';
import { formatNumber } from '@angular/common';

/**
 * #90: el monto sube o baja contando hasta el valor nuevo, en vez de saltar de golpe.
 * Se ve cuando entra o sale plata. Muestra el número con " Gs." y nada mientras es null.
 */
@Directive({ selector: '[appContador]' })
export class ContadorDirective implements OnDestroy {
  private actual = 0;
  private cuadro = 0;

  constructor(private el: ElementRef<HTMLElement>, @Inject(LOCALE_ID) private locale: string) {}

  @Input() set appContador(valor: number | null | undefined) {
    cancelAnimationFrame(this.cuadro);
    if (valor == null) { this.el.nativeElement.textContent = ''; return; }

    const desde = this.actual, hasta = valor, duracion = 700;
    const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (sinMovimiento || desde === hasta) { this.pintar(hasta); return; }

    // El inicio sale del primer cuadro: mezclarlo con performance.now() desfasa los relojes.
    let inicio: number | undefined;
    const paso = (ahora: number) => {
      inicio ??= ahora;
      const t = Math.min(1, (ahora - inicio) / duracion);
      this.pintar(desde + (hasta - desde) * (1 - Math.pow(1 - t, 3)));  // ease-out
      if (t < 1) this.cuadro = requestAnimationFrame(paso);
    };
    this.cuadro = requestAnimationFrame(paso);
  }

  private pintar(v: number) {
    this.actual = v;
    this.el.nativeElement.textContent = `${formatNumber(Math.round(v), this.locale, '1.0-0')} Gs.`;
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.cuadro);
  }
}
