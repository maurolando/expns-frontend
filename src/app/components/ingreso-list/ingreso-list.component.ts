import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { IngresoService, Ingreso } from 'src/app/services/ingreso/ingreso.service';
import { PersonaService, Persona } from 'src/app/services/persona/persona.service';
import { ExpenseService, Categoria, Gasto } from 'src/app/services/expense/expense.service';
import { Observable, combineLatest, Subject } from 'rxjs';
import { map, startWith, takeUntil } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { IngresoFormComponent } from '../ingreso-form/ingreso-form.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { NotificationService } from 'src/app/services/notification/notification.service';

export interface Billetera { forma: string; entro: number; salio: number; saldo: number; }
interface Movimiento { personaId?: string; fecha?: string; formaPago?: string; monto: number; }

/** La plata que salió de verdad: lo pagado de un gasto común, y cada pago de uno compartido. */
export function salidasDe(gastos: Gasto[]): Movimiento[] {
  return gastos.flatMap(g => g.esCompartido
    ? (g.pagosCompartidos ?? []).map(p => ({ personaId: p.persona?.id, fecha: p.fecha ?? g.date, formaPago: p.formaPago, monto: p.monto }))
    : g.pagado ? [{ personaId: g.persona?.id, fecha: g.date, formaPago: g.formaPago, monto: g.amount }] : []);
}

/** #82: cuánto queda en cada billetera = lo que entró por ahí menos lo que se pagó por ahí. */
export function saldoPorBilletera(entradas: Movimiento[], salidas: Movimiento[]): Billetera[] {
  const b = new Map<string, Billetera>();
  const de = (forma?: string) => {
    const k = forma || 'Sin definir';
    if (!b.has(k)) b.set(k, { forma: k, entro: 0, salio: 0, saldo: 0 });
    return b.get(k)!;
  };
  entradas.forEach(m => { const x = de(m.formaPago); x.entro += m.monto; x.saldo += m.monto; });
  salidas.forEach(m => { const x = de(m.formaPago); x.salio += m.monto; x.saldo -= m.monto; });
  return [...b.values()];
}

function enRango(fecha: string | undefined, desde: Date | null, hasta: Date | null): boolean {
  if (!fecha) return true;
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  if (desde && d < new Date(new Date(desde).setHours(0, 0, 0, 0))) return false;
  if (hasta && d > new Date(new Date(hasta).setHours(0, 0, 0, 0))) return false;
  return true;
}

@Component({
  selector: 'app-ingreso-list',
  templateUrl: './ingreso-list.component.html',
  styleUrls: ['./ingreso-list.component.scss']
})
export class IngresoListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  displayedColumns: string[] = ['fecha', 'persona', 'tipo', 'formaPago', 'monto'];
  ingresos$!: Observable<Ingreso[]>;
  billeteras$!: Observable<Billetera[]>;
  personas$!: Observable<Persona[]>;
  categorias$!: Observable<Categoria[]>;

  // Filters Controls
  personaFilter = new FormControl('');
  categoriaFilter = new FormControl('');
  fechaInicioFilter = new FormControl<Date | null>(null);
  fechaFinFilter = new FormControl<Date | null>(null);

  hasActiveFilters$!: Observable<boolean>;

  /** Mismo patron que categorias: se elige una fila y aparecen sus acciones. */
  selectedIngreso: Ingreso | null = null;

  constructor(
    private service: IngresoService, 
    private personaService: PersonaService,
    private expenseService: ExpenseService,
    private dialog: MatDialog,
    private notify: NotificationService
  ) {}

  ngOnInit() {
    this.personas$ = this.personaService.getPersonas();
    this.categorias$ = this.expenseService.getCategorias('INGRESO');

    const filterChanges$ = combineLatest([
      this.personaFilter.valueChanges.pipe(startWith('')),
      this.categoriaFilter.valueChanges.pipe(startWith('')),
      this.fechaInicioFilter.valueChanges.pipe(startWith(null)),
      this.fechaFinFilter.valueChanges.pipe(startWith(null))
    ]).pipe(takeUntil(this.destroy$));

    this.hasActiveFilters$ = filterChanges$.pipe(
      map(([p, c, fi, ff]) => !!(p || c || fi || ff))
    );

    this.ingresos$ = combineLatest([
      this.service.getIngresos(),
      filterChanges$
    ]).pipe(
      takeUntil(this.destroy$),
      map(([ingresos, [persona, categoria, fechaInicio, fechaFin]]) => {
        return ingresos.filter(i => {
          // 1. Filtrar por persona
          if (persona && i.persona?.id !== persona) {
            return false;
          }

          // 2. Filtrar por categoría
          if (categoria && i.categoria?.id !== categoria) {
            return false;
          }

          // 3. Filtrar por rango de fechas
          return enRango(i.fecha, fechaInicio, fechaFin);
        });
      })
    );

    // #82: con los filtros de persona y fecha; el de categoría es de ingresos y no aplica a lo gastado.
    this.billeteras$ = combineLatest([
      this.service.getIngresos(),
      this.expenseService.getGastos(),
      filterChanges$
    ]).pipe(
      takeUntil(this.destroy$),
      map(([ingresos, gastos, [persona, , desde, hasta]]) => {
        const pasa = (m: Movimiento) => (!persona || m.personaId === persona) && enRango(m.fecha, desde, hasta);
        const entradas = ingresos.map(i => ({ personaId: i.persona?.id, fecha: i.fecha, formaPago: i.formaPago, monto: i.monto }));
        return saldoPorBilletera(entradas.filter(pasa), salidasDe(gastos).filter(pasa));
      })
    );
  }

  clearFilters() {
    this.personaFilter.setValue('');
    this.categoriaFilter.setValue('');
    this.fechaInicioFilter.setValue(null);
    this.fechaFinFilter.setValue(null);
  }

  openAddIngreso() {
    this.dialog.open(IngresoFormComponent, {
      width: '450px'
    });
  }

  /** Volver a tocar la fila elegida la deselecciona, como en categorias. */
  selectIngreso(ingreso: Ingreso) {
    this.selectedIngreso = this.selectedIngreso?.id === ingreso.id ? null : ingreso;
  }

  editIngreso(ingreso: Ingreso, event: Event) {
    event.stopPropagation();
    const dialogRef = this.dialog.open(IngresoFormComponent, {
      width: '450px',
      data: ingreso
    });
    dialogRef.afterClosed().subscribe(guardado => {
      if (guardado) {
        this.selectedIngreso = null;
      }
    });
  }

  deleteIngreso(ingreso: Ingreso, event: Event) {
    event.stopPropagation();
    const detalle = [ingreso.categoria?.nombre, ingreso.persona?.nombre]
      .filter(Boolean)
      .join(' · ');

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: '¿Borrar este ingreso?',
        message: `${detalle || 'Ingreso'}\n${ingreso.monto.toLocaleString('es-PY')} Gs.\n\n`
          + 'Se va a descontar del balance. Esta acción no se puede deshacer.'
      }
    });

    dialogRef.afterClosed().subscribe(confirmado => {
      if (!confirmado) return;
      this.service.deleteIngreso(ingreso.id!).subscribe({
        next: () => {
          this.selectedIngreso = null;
          this.notify.success('Ingreso eliminado');
        },
        error: () => this.notify.error('No se pudo eliminar el ingreso')
      });
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
