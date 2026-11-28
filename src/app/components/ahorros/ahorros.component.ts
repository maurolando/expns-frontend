import { Component, OnInit, OnDestroy, TemplateRef, ViewChild } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { FormControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable, combineLatest, Subject } from 'rxjs';
import { finalize, map, startWith, switchMap, takeUntil } from 'rxjs/operators';
import { ExpenseService } from 'src/app/services/expense/expense.service';
import { IngresoService } from 'src/app/services/ingreso/ingreso.service';
import { AhorroService, Ahorro } from 'src/app/services/ahorro/ahorro.service';
import { PersonaService, Persona } from 'src/app/services/persona/persona.service';
import { NotificationService } from 'src/app/services/notification/notification.service';
import { fromLocalISODate, periodoDe, toLocalISODate } from 'src/app/utils/date.util';
import { HogarService } from 'src/app/services/hogar/hogar.service';

const SAVINGS_GOAL_KEY = 'app_gastos_savings_goal';

@Component({
  selector: 'app-ahorros',
  templateUrl: './ahorros.component.html',
  styleUrls: ['./ahorros.component.scss']
})
export class AhorrosComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  monthControl = new FormControl(new Date().getMonth() + 1);
  yearControl = new FormControl(new Date().getFullYear());
  
  goalControl = new FormControl(Number(localStorage.getItem(SAVINGS_GOAL_KEY)) || 500000);
  isEditingGoal = false;

  years = [2024, 2025, 2026, 2027];
  months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
  ];

  totalIngresos$!: Observable<number>;
  totalGastosPagados$!: Observable<number>;
  ahorroActual$!: Observable<number>;
  ahorroPercent$!: Observable<number>;
  ahorroFaltante$!: Observable<number>;
  ahorrosList$!: Observable<Ahorro[]>;
  personas$!: Observable<Persona[]>;

  savingForm: FormGroup;

  @ViewChild('cargaAhorro') cargaAhorroTpl!: TemplateRef<unknown>;
  private cargaRef?: MatDialogRef<unknown>;
  guardando = false;
  /** Con id, el diálogo de carga edita ese ahorro en vez de crear uno. */
  editandoId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private expenseService: ExpenseService,
    private ingresoService: IngresoService,
    private ahorroService: AhorroService,
    private personaService: PersonaService,
    private notify: NotificationService,
    private dialog: MatDialog,
    private hogarService: HogarService
  ) {
    this.savingForm = this.fb.group({
      monto: ['', [Validators.required, Validators.min(0.01)]],
      fecha: [new Date(), Validators.required],
      personaId: [''],
      formaPago: ['Efectivo', Validators.required],
      descripcion: ['']
    });
  }

  ngOnInit(): void {
    this.personas$ = this.personaService.getPersonas();

    // El mes del hogar puede no ser el del calendario (si cobran el 4, el 3 sigue siendo el mes anterior).
    this.hogarService.getConfig().pipe(takeUntil(this.destroy$)).subscribe(config => {
      const { mes, anio } = periodoDe(new Date(), config.diaInicioMes);
      this.yearControl.setValue(anio);
      this.monthControl.setValue(mes);
    });

    const data$ = combineLatest([
      this.monthControl.valueChanges.pipe(startWith(this.monthControl.value)),
      this.yearControl.valueChanges.pipe(startWith(this.yearControl.value))
    ]).pipe(
      switchMap(([m, y]) => {
        return combineLatest([
          this.expenseService.getGastos(m!, y!),
          this.ingresoService.getIngresos(m!, y!),
          this.ahorroService.getAhorros(m!, y!)
        ]);
      }),
      takeUntil(this.destroy$)
    );

    this.ahorrosList$ = data$.pipe(
      map(([_, __, ahorros]) => ahorros)
    );

    this.totalGastosPagados$ = data$.pipe(
      map(([gastos, _, __]) => gastos.filter(g => g.pagado).reduce((acc, g) => acc + g.amount, 0))
    );

    this.ahorroActual$ = data$.pipe(
      map(([_, __, ahorros]) => ahorros.reduce((acc, a) => acc + a.monto, 0))
    );

    this.totalIngresos$ = data$.pipe(
      map(([_, ingresos, ahorros]) => {
        const gross = ingresos.reduce((acc, i) => acc + i.monto, 0);
        const ahorro = ahorros.reduce((acc, a) => acc + a.monto, 0);
        return Math.max(0, gross - ahorro);
      })
    );

    this.ahorroPercent$ = combineLatest([this.ahorroActual$, this.goalControl.valueChanges.pipe(startWith(this.goalControl.value))]).pipe(
      map(([actual, goal]) => {
        if (!goal || goal <= 0) return 0;
        return Math.min(100, (actual / goal) * 100);
      })
    );

    this.ahorroFaltante$ = combineLatest([this.ahorroActual$, this.goalControl.valueChanges.pipe(startWith(this.goalControl.value))]).pipe(
      map(([actual, goal]) => Math.max(0, (goal || 0) - actual))
    );
  }

  abrirCargaAhorro() {
    this.cargaRef = this.dialog.open(this.cargaAhorroTpl, { width: '440px' });
    // Al cerrar, de cualquier forma, el próximo "Cargar" arranca en blanco.
    this.cargaRef.afterClosed().subscribe(() => {
      if (this.editandoId) {
        this.editandoId = null;
        this.savingForm.reset({ monto: '', fecha: new Date(), personaId: '', formaPago: 'Efectivo', descripcion: '' });
      }
    });
  }

  /** #82: sobre todo para asignarles billetera a los ahorros cargados antes de que existiera. */
  editarAhorro(a: Ahorro) {
    this.editandoId = a.id!;
    this.savingForm.reset({
      monto: a.monto,
      fecha: fromLocalISODate(a.fecha),
      personaId: a.persona?.id ?? '',
      formaPago: a.formaPago || 'Efectivo',
      descripcion: a.descripcion ?? ''
    });
    this.abrirCargaAhorro();
  }

  cargarAhorro() {
    if (this.savingForm.valid) {
      const v = this.savingForm.value;
      const formattedDate = toLocalISODate(v.fecha);
      
      const peticion = this.editandoId
        // En la edición, persona vacía va como undefined: el backend deja la que tenía.
        ? this.ahorroService.updateAhorro(this.editandoId, v.monto, formattedDate, v.personaId || undefined, v.descripcion ?? '', v.formaPago)
        : this.ahorroService.createAhorro(v.monto, formattedDate, v.personaId || null, v.descripcion || '', v.formaPago);
      const editando = !!this.editandoId;
      this.guardando = true;
      peticion
        .pipe(finalize(() => this.guardando = false))
        .subscribe({
          next: () => {
            this.notify.success(editando ? 'Ahorro actualizado' : 'Ahorro cargado con éxito');
            this.savingForm.patchValue({
              monto: '',
              descripcion: '',
              fecha: new Date(),
              personaId: ''
            });
            this.savingForm.markAsPristine();
            this.savingForm.markAsUntouched();
            this.cargaRef?.close();
          },
          error: (err) => {
            console.error('Error al guardar ahorro:', err);
            this.notify.error(editando ? 'No se pudo actualizar el ahorro' : 'Error al registrar el ahorro');
          }
        });
    } else {
      this.notify.error('Por favor completa todos los campos requeridos.');
    }
  }

  eliminarAhorro(id: string) {
    if (confirm('¿Estás seguro de que deseas eliminar este registro de ahorro?')) {
      this.ahorroService.deleteAhorro(id).subscribe({
        next: () => {
          this.notify.success('Registro de ahorro eliminado con éxito');
        },
        error: (err) => {
          console.error('Error al eliminar ahorro:', err);
          this.notify.error('Error al eliminar el ahorro');
        }
      });
    }
  }

  saveGoal() {
    const val = this.goalControl.value;
    if (val && val > 0) {
      localStorage.setItem(SAVINGS_GOAL_KEY, String(val));
      this.isEditingGoal = false;
      this.notify.success('Meta de ahorro actualizada');
    } else {
      this.notify.error('La meta debe ser mayor a 0');
    }
  }

  toggleEditGoal() {
    this.isEditingGoal = !this.isEditingGoal;
    if (!this.isEditingGoal) {
      this.goalControl.setValue(Number(localStorage.getItem(SAVINGS_GOAL_KEY)) || 500000);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
