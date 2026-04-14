import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';

import { ResidentSearchComponent } from './resident-search';
import { ApiService } from '../services/api';
import { provideHttpClient } from '@angular/common/http';

describe('ResidentSearchComponent', () => {
  let component: ResidentSearchComponent;
  let fixture: ComponentFixture<ResidentSearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResidentSearchComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: ApiService,
          useValue: {
            getResidentByCin: () => of({ cin: 'AA', fiches: [] })
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResidentSearchComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
