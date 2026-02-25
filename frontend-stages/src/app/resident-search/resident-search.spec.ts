import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResidentSearch } from './resident-search';

describe('ResidentSearch', () => {
  let component: ResidentSearch;
  let fixture: ComponentFixture<ResidentSearch>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResidentSearch]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResidentSearch);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
