import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from '../api.config';

/** The complete public shape of an organisation. Nothing else is exposed. */
export interface PublicOrganisation {
  slug: string;
  name: string;
  tagline: string;
  createdAt: string;
  projectCount: number;
  memberCount: number;
  /** Present on a single profile response: how many a visitor can open. */
  publicProjectCount?: number;
}

export interface OwnVisibility extends PublicOrganisation {
  isPublic: boolean;
}

/** A milestone as shown to a visitor: no assignee, no description. */
export interface PublicMilestone {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  progress: number;
}

/**
 * The complete public shape of a project.
 *
 * There is deliberately no client, no design review, no clarification, no
 * evidence and no member here. If a field is not on this interface, a visitor
 * cannot see it.
 */
export interface PublicProject {
  id: string;
  name: string;
  description: string;
  status: string;
  progress: number;
  tags: string[];
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  organisation: { name: string; slug: string };
  milestones: PublicMilestone[];
}

@Injectable({ providedIn: 'root' })
export class DirectoryService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/organisations`;
  private readonly own = `${API_BASE}/workspace/visibility`;

  search(q: string): Observable<PublicOrganisation[]> {
    return this.http
      .get<{ organisations: PublicOrganisation[] }>(`${this.base}/search`, { params: { q } })
      .pipe(map((r) => r.organisations));
  }

  /** Published projects across every published organisation. */
  browseProjects(): Observable<PublicProject[]> {
    return this.http
      .get<{ projects: PublicProject[] }>(`${this.base}/projects`)
      .pipe(map((r) => r.projects));
  }

  publicProject(id: string): Observable<PublicProject> {
    return this.http
      .get<{ project: PublicProject }>(`${this.base}/projects/${id}`)
      .pipe(map((r) => r.project));
  }

  organisationProjects(slug: string): Observable<PublicProject[]> {
    return this.http
      .get<{ projects: PublicProject[] }>(`${this.base}/${slug}/projects`)
      .pipe(map((r) => r.projects));
  }

  profile(slug: string): Observable<PublicOrganisation> {
    return this.http
      .get<{ organisation: PublicOrganisation }>(`${this.base}/${slug}`)
      .pipe(map((r) => r.organisation));
  }

  visibility(): Observable<OwnVisibility> {
    return this.http
      .get<{ organisation: OwnVisibility }>(this.own)
      .pipe(map((r) => r.organisation));
  }

  updateVisibility(input: { isPublic?: boolean; tagline?: string }): Observable<OwnVisibility> {
    return this.http
      .patch<{ organisation: OwnVisibility }>(this.own, input)
      .pipe(map((r) => r.organisation));
  }
}
