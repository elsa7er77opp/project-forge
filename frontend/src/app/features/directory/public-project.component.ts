import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { BadgeComponent } from '../../shared/badge.component';
import { ProgressBarComponent } from '../../shared/progress-bar.component';
import { DirectoryService, type PublicProject } from '../../core/api/directory.service';

/**
 * One published project, readable without an account.
 *
 * A project that is private, archived, or belongs to an unpublished
 * organisation returns 404 here — the same response as one that does not exist.
 * "Forbidden" would confirm the record is real.
 */
@Component({
  selector: 'app-public-project',
  standalone: true,
  imports: [RouterLink, DatePipe, BadgeComponent, ProgressBarComponent],
  template: `
    <div class="dir">
      <header class="dir__head">
        <a class="dir__brand" routerLink="/organisations">
          <span class="dir__mark">M</span>
          <span>FORGE</span>
        </a>
        <div class="dir__headactions">
          <a class="btn btn--ghost btn--sm" routerLink="/projects/public">All public projects</a>
          <a class="btn btn--outline btn--sm" routerLink="/login">Sign in</a>
        </div>
      </header>

      <div class="dir__body">
        @if (loading()) {
          <div aria-busy="true">
            <span class="sr-only">Loading project…</span>
            <div class="card card--pad" aria-hidden="true">
              <span class="skeleton skeleton--badge"></span>
              <span
                class="skeleton skeleton--title"
                style="width: 52%; height: 26px; margin: 16px 0 12px"
              ></span>
              <div class="skeleton-stack">
                <span class="skeleton skeleton--text skeleton--line-lg"></span>
                <span class="skeleton skeleton--text skeleton--line-md"></span>
              </div>
            </div>
          </div>
        } @else if (error()) {
          <div class="dir__notfound">
            <h1 class="dir__title">Not found</h1>
            <p class="dir__sub">{{ error() }}</p>
            <a class="btn btn--primary" routerLink="/projects/public">Browse public projects</a>
          </div>
        } @else if (project(); as p) {
          <article class="pubdetail">
            <nav class="pubdetail__crumbs">
              <a routerLink="/projects/public">Public projects</a>
              <span aria-hidden="true">/</span>
              <a [routerLink]="['/organisations', p.organisation.slug]">{{
                p.organisation.name
              }}</a>
            </nav>

            <div class="pubdetail__head card card--pad">
              <div class="pubdetail__badges">
                <app-badge [label]="label(p.status)" [tone]="statusTone(p.status)" />
                <span class="muted">{{ p.organisation.name }}</span>
              </div>

              <h1 class="pubdetail__name">{{ p.name }}</h1>

              @if (p.description) {
                <p class="pubdetail__desc">{{ p.description }}</p>
              }

              @if (p.tags.length) {
                <div class="pubcard__tags">
                  @for (t of p.tags; track t) {
                    <span class="tag">{{ t }}</span>
                  }
                </div>
              }

              <div class="pubdetail__progress">
                <div class="pubcard__progresshead">
                  <span class="muted">Overall progress</span>
                  <span class="pubcard__pct">{{ p.progress }}%</span>
                </div>
                <app-progress [value]="p.progress" [height]="10" />
              </div>

              <dl class="pubdetail__meta">
                <div>
                  <dt>Started</dt>
                  <dd>{{ p.startDate ? (p.startDate | date: 'd MMM y') : '—' }}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{{ p.endDate ? (p.endDate | date: 'd MMM y') : '—' }}</dd>
                </div>
                <div>
                  <dt>Published since</dt>
                  <dd>{{ p.createdAt | date: 'MMM y' }}</dd>
                </div>
              </dl>
            </div>

            <section class="card card--pad pubdetail__section">
              <h2 class="pubdetail__h2">Milestones</h2>
              @if (!p.milestones.length) {
                <p class="muted">No milestones have been recorded for this project.</p>
              } @else {
                <ul class="pubms">
                  @for (m of p.milestones; track m.id) {
                    <li class="pubms__row">
                      <div class="pubms__main">
                        <span class="pubms__title">{{ m.title }}</span>
                        <span class="muted pubms__due">
                          {{ m.dueDate ? (m.dueDate | date: 'd MMM y') : 'No due date' }}
                        </span>
                      </div>
                      <app-badge
                        [label]="label(m.status)"
                        [tone]="milestoneTone(m.status)"
                        [plain]="true"
                      />
                      <span class="pubms__pct">{{ m.progress }}%</span>
                    </li>
                  }
                </ul>
              }
            </section>

            <p class="pubdetail__note">
              This is a public view. Design reviews, clarifications, technical evidence, client
              details and team members are private to {{ p.organisation.name }}.
            </p>
          </article>
        }
      </div>
    </div>
  `,
  styleUrl: './directory.scss',
})
export class PublicProjectComponent {
  private readonly directory = inject(DirectoryService);
  private readonly route = inject(ActivatedRoute);

  readonly project = signal<PublicProject | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.directory.publicProject(id).subscribe({
      next: (project) => {
        this.project.set(project);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('This project is not published, or does not exist.');
        this.loading.set(false);
      },
    });
  }

  label(status: string): string {
    return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  }

  statusTone(status: string): string {
    switch (status) {
      case 'ACTIVE':
        return 'primary';
      case 'COMPLETED':
        return 'success';
      case 'ON_HOLD':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  milestoneTone(status: string): string {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'IN_PROGRESS':
        return 'primary';
      case 'DELAYED':
        return 'danger';
      default:
        return 'neutral';
    }
  }
}
