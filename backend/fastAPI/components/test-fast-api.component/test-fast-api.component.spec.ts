import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestFastAPIComponent } from './test-fast-api.component';

describe('TestFastAPIComponent', () => {
  let component: TestFastAPIComponent;
  let fixture: ComponentFixture<TestFastAPIComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestFastAPIComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestFastAPIComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
