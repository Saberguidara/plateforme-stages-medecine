import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { AdminLogin } from './admin-login';

describe('AdminLogin', () => {
  let component: AdminLogin;
  let fixture: ComponentFixture<AdminLogin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLogin],
      providers: [provideRouter([]), provideHttpClient()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminLogin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
