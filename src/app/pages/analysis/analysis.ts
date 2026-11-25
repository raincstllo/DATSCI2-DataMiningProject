import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ResultsStore } from '../../core/results.store';
import { RunPanel } from '../../shared/run-panel/run-panel';
import { RetentionDetails } from './retention-details';
import { RevenueDetails } from './revenue-details';

/** Technical page: run each pipeline live and see how the results were produced. */
@Component({
  selector: 'app-analysis',
  imports: [RouterLink, RunPanel, RetentionDetails, RevenueDetails],
  providers: [provideCharts(withDefaultRegisterables())],
  template: `
    <div class="stack">
      <div>
        <h1>Analysis details</h1>
        <p class="lead">
          How the results are produced: data cleaning with PySpark, the data mining models and how
          well they perform. The
          <a routerLink="/retention">Follow-ups</a> and <a routerLink="/revenue">Revenue</a> pages show
          the same results in plain language.
        </p>
      </div>

      <section class="stack" aria-labelledby="retention-section">
        <h2 id="retention-section">Patient retention: K-Means clustering</h2>
        <app-run-panel
          type="retention"
          idPrefix="run-retention"
          [headingLevel]="3"
          description="Loads the visit records, cleans them with PySpark, builds recency, frequency and spend features per patient, then runs K-Means. Takes 1 to 2 minutes."
        />
        <app-retention-details />
      </section>

      <section class="stack" aria-labelledby="revenue-section">
        <h2 id="revenue-section">Revenue: Random Forest forecast and Apriori rules</h2>
        <app-run-panel
          type="revenue"
          idPrefix="run-revenue"
          [headingLevel]="3"
          description="Loads the visit records, cleans them with PySpark, builds monthly totals and lag features, trains and tests the forecast model, then runs Apriori. Takes 2 to 3 minutes."
        />
        <app-revenue-details />
      </section>
    </div>
  `,
})
export class Analysis implements OnInit {
  private readonly store = inject(ResultsStore);

  ngOnInit(): void {
    this.store.load('retention');
    this.store.load('revenue');
  }
}
