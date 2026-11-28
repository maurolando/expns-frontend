import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ContadorDirective } from './contador.directive';

@Component({ template: `<h2 [appContador]="monto"></h2>` })
class AnfitrionComponent { monto: number | null = null; }

describe('ContadorDirective', () => {
  let fixture: ComponentFixture<AnfitrionComponent>;
  const texto = () => (fixture.nativeElement.querySelector('h2') as HTMLElement).textContent;

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [AnfitrionComponent, ContadorDirective] });
    fixture = TestBed.createComponent(AnfitrionComponent);
    fixture.detectChanges();
  });

  it('no muestra nada mientras el monto es null', () => {
    expect(texto()).toBe('');
  });

  it('termina mostrando el monto exacto, también al bajar', fakeAsync(() => {
    fixture.componentInstance.monto = 1500000;
    fixture.detectChanges();
    tick(1000);
    expect(texto()).toMatch(/^1.500.000 Gs\.$/);

    fixture.componentInstance.monto = 0;
    fixture.detectChanges();
    tick(1000);
    expect(texto()).toBe('0 Gs.');
  }));
});
