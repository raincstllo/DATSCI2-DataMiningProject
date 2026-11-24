import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestFastAPIDisplayComponent } from './test-fast-apidisplay.component';

describe('TestFastAPIDisplayComponent', () => {
  let component: TestFastAPIDisplayComponent;
  let fixture: ComponentFixture<TestFastAPIDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestFastAPIDisplayComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestFastAPIDisplayComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
