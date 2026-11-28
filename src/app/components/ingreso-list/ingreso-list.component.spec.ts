import { moduloDePrueba } from 'src/testing/modulo-de-prueba';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IngresoListComponent, saldoPorBilletera, salidasDe } from './ingreso-list.component';
import { Gasto } from 'src/app/services/expense/expense.service';

describe('IngresoListComponent', () => {
  let component: IngresoListComponent;
  let fixture: ComponentFixture<IngresoListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule(moduloDePrueba([IngresoListComponent]))
    .compileComponents();

    fixture = TestBed.createComponent(IngresoListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('saldo por billetera: entra lo ingresado, sale lo pagado y cada pago de un compartido', () => {
    const gastos = [
      { amount: 300, pagado: true, formaPago: 'Efectivo', date: '2026-11-02' },
      { amount: 999, pagado: false, formaPago: 'Efectivo', date: '2026-11-02' },
      { amount: 500, esCompartido: true, pagado: false, date: '2026-11-03', pagosCompartidos: [
        { persona: { id: '1' }, monto: 200, formaPago: 'Transferencia' },
        { persona: { id: '2' }, monto: 100, formaPago: 'Tarjeta de Crédito' }
      ] }
    ] as unknown as Gasto[];

    const b = saldoPorBilletera(
      [{ formaPago: 'Efectivo', monto: 1000 }, { formaPago: 'Transferencia', monto: 500 }, { monto: 50 }],
      salidasDe(gastos));

    const por = (f: string) => b.find(x => x.forma === f);
    expect(por('Efectivo')).toEqual({ forma: 'Efectivo', entro: 1000, salio: 300, saldo: 700 });
    expect(por('Transferencia')?.saldo).toBe(300);
    expect(por('Tarjeta de Crédito')?.saldo).toBe(-100);
    expect(por('Sin definir')?.saldo).toBe(50);
  });
});
