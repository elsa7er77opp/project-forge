import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { API_BASE } from '../api.config';
import type { Evidence, EvidenceInput } from '../models';

@Injectable({ providedIn: 'root' })
export class EvidenceService {
  private readonly http = inject(HttpClient);

  list(projectId: string): Observable<Evidence[]> {
    return this.http
      .get<{ evidence: Evidence[] }>(`${API_BASE}/projects/${projectId}/evidence`)
      .pipe(map((r) => r.evidence));
  }

  create(projectId: string, input: EvidenceInput): Observable<Evidence> {
    return this.http
      .post<{ evidence: Evidence }>(`${API_BASE}/projects/${projectId}/evidence`, input)
      .pipe(map((r) => r.evidence));
  }

  update(id: string, input: Partial<EvidenceInput>): Observable<Evidence> {
    return this.http
      .patch<{ evidence: Evidence }>(`${API_BASE}/evidence/${id}`, input)
      .pipe(map((r) => r.evidence));
  }

  /**
   * Uploads a file as multipart form data, reporting progress so a large
   * document does not look like a frozen interface.
   */
  upload(
    projectId: string,
    file: File,
    meta: { title?: string; description?: string } = {},
  ): Observable<HttpEvent<{ evidence: Evidence }>> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (meta.title) form.append('title', meta.title);
    if (meta.description) form.append('description', meta.description);

    return this.http.post<{ evidence: Evidence }>(
      `${API_BASE}/projects/${projectId}/evidence/upload`,
      form,
      { reportProgress: true, observe: 'events' },
    );
  }

  /**
   * Fetches a stored file as a blob rather than navigating to the URL.
   *
   * The download endpoint requires the Authorization header, which a plain
   * anchor or window.open cannot send. Going through HttpClient means the
   * interceptor attaches the token as it does for every other request.
   */
  download(id: string): Observable<Blob> {
    return this.http.get(`${API_BASE}/evidence/${id}/download`, { responseType: 'blob' });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/evidence/${id}`);
  }
}
