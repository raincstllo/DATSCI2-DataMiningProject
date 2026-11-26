import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FlashService } from '../../core/flash.service';
import { formatDate, formatPeso, formatPhone, todayIso } from '../../core/format';
import { PatientDetail as Detail } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { ToothStrip } from '../../shared/tooth-strip';

@Component({
  selector: 'app-patient-detail',
  imports: [RouterLink, ConfirmDialog, ToothStrip],
  templateUrl: './patient-detail.html',
  styleUrl: './patients.css',
})
export class PatientDetailPage implements OnInit {
  private readonly records = inject(RecordsService);
  private readonly router = inject(Router);
  private readonly flash = inject(FlashService);
  private readonly confirm = viewChild(ConfirmDialog);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly today = todayIso();
  protected readonly phone = formatPhone;
  protected readonly peso = formatPeso;
  protected readonly date = formatDate;
  protected readonly patient = signal<Detail | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly totalSpent = computed(() =>
    (this.patient()?.visits ?? []).reduce((sum, v) => sum + v.total_fee, 0),
  );
  protected readonly lastVisit = computed(() => this.patient()?.visits[0]?.date_visited ?? null);
  protected readonly firstVisit = computed(() => this.patient()?.visits.at(-1)?.date_visited ?? null);

  ngOnInit(): void {
    this.records.getPatient(this.id).subscribe({
      next: (p) => this.patient.set(p),
      error: (err: unknown) => this.error.set(readApiError(err, 'This patient could not be loaded.').message),
    });
  }

  protected serviceText(v: Detail['visits'][number]): string {
    return v.services
      .map((s) => (s.teeth_operated.length ? `${s.nature_of_visit} (${s.teeth_operated.join(', ')})` : s.nature_of_visit))
      .join(', ');
  }

  protected async remove(): Promise<void> {
    const p = this.patient();
    if (!p || !(await this.confirm()?.ask())) return;
    this.records.deletePatient(p.patient_id).subscribe({
      next: () => {
        this.flash.show(`${p.name} (${p.patient_id}) deleted.`);
        this.router.navigate(['/patients']);
      },
      error: (err: unknown) => this.error.set(readApiError(err, 'The patient could not be deleted.').message),
    });
  }
}
