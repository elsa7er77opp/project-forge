import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { BadgeComponent } from '../../shared/badge.component';
import { ProgressBarComponent } from '../../shared/progress-bar.component';
import { DirectoryService, type PublicProject } from '../../core/api/directory.service';

/**
 * Published projects across every published organisation.
 *
 * Reachable without an account. Everything here is read-only by construction:
 * the endpoint behind it returns no control affordances and the API rejects any
 * write from an unauthenticated caller.
 */
@Component({
  selector: 'app-public-projects',
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
          <a class="btn btn--ghost btn--sm" routerLink="/organisations">Organisations</a>
          <a class="btn btn--outline btn--sm" routerLink="/login">Sign in</a>
        </div>
      </header>

      <div class="dir__body">
        <h1 class="dir__title">Public projects</h1>
        <p class="dir__sub">
          Engineering work that organisations have chosen to publish. Names, progress and
          milestones are shown; clients, design reviews, clarifications and evidence stay
          private.
        </p>

        @if (search.length || projects().length) {
          <div class="pubsearch">
            <input
              class="input"
              type="search"
              placeholder="Filter by project, organisation or tag…"
              [value]="search"
              (input)="onSearch($event)"
              aria-label="Filter public projects"
            />
          </div>
        }

        @if (loading()) {
          <div class="pubgrid" aria-busy="true">
            <span class="sr-only">Loading published projects…</span>
            @for (card of skeletons; track card) {
              <div class="pubcard" aria-hidden="true">
                <span class="skeleton skeleton--badge"></span>
                <span class="skeleton skeleton--title" style="width: 70%; margin: 14px 0 10px"></span>
                <div class="skeleton-stack">
                  <span class="skeleton skeleton--text skeleton--line-lg"></span>
                  <span class="skeleton skeleton--text skeleton--line-md"></span>
                </div>
                <span class="skeleton" style="height: 8px; border-radius: 999px; margin-top: 18px"></span>
              </div>
            }
          </div>
        } @else if (error()) {
          <div class="card card--pad empty-state">{{ error() }}</div>
        } @else if (!projects().length) {
          <div class="card card--pad empty-state">
            <p>No projects have been published yet.</p>
            <p class="muted">
              An organisation administrator can publish a project from its detail page.
            </p>
          </div>
        } @else if (!filtered().length) {
          <div class="card card--pad empty-state">
            No published project matches “{{ search }}”.
          </div>
        } @else {
          <div class="pubgrid">
            @for (p of filtered(); track p.id) {
              <a class="pubcard" [routerLink]="['/projects/public', p.id]">
                <div class="pubcard__top">
                  <app-badge [label]="label(p.status)" [tone]="statusTone(p.status)" />
                  <span class="pubcard__org">{{ p.organisation.name }}</span>
                </div>
                <h2 class="pubcard__name">{{ p.name }}</h2>
                @if (p.description) {
                  <p class="pubcard__desc">{{ p.description }}</p>
                }
                @if (p.tags.length) {
                  <div class="pubcard__tags">
                    @for (t of p.tags.slice(0, 3); track t) {
                      <span class="tag">{{ t }}</span>
                    }
                    @if (p.tags.length > 3) {
                      <span class="tag">+{{ p.tags.length - 3 }}</span>
                    }
                  </div>
                }
                <div class="pubcard__progress">
                  <div class="pubcard__progresshead">
                    <span class="muted">Progress</span>
                    <span class="pubcard__pct">{{ p.progress }}%</span>
                  </div>
                  <app-progress [value]="p.progress" />
                </div>
                <div class="pubcard__foot">
                  <span class="muted">{{ p.milestones.length }} milestones</span>
                  @if (p.endDate) {
                    <span class="muted">Due {{ p.endDate | date: 'MMM y' }}</span>
                  }
                </div>
              </a>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrl: './directory.scss',
})
export class PublicProjectsComponent {
  private readonly directory = inject(DirectoryService);

  readonly projects = signal<PublicProject[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly skeletons = [0, 1, 2, 3, 4, 5];

  search = '';
  private readonly term = signal('');

  readonly filtered = computed(() => {
    const q = this.term().trim().toLowerCase();
    if (!q) return this.projects();
    return this.projects().filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.organisation.name.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  });

  constructor() {
    this.directory.browseProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load published projects.');
        this.loading.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    this.search = (event.target as HTMLInputElement).value;
    this.term.set(this.search);
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
}
