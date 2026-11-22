import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private config = inject(AppConfigService);

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>, headers?: Record<string, string>): Observable<T> {
    let hp = new HttpParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) hp = hp.set(k, String(v));
    return this.http.get<T>(`${this.config.apiBase}${path}`, { params: hp, headers: this.headers(headers) }).pipe(catchError(this.handle));
  }

  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Observable<T> {
    return this.http.post<T>(`${this.config.apiBase}${path}`, body ?? {}, { headers: this.headers(headers) }).pipe(catchError(this.handle));
  }

  put<T>(path: string, body?: unknown, headers?: Record<string, string>): Observable<T> {
    return this.http.put<T>(`${this.config.apiBase}${path}`, body ?? {}, { headers: this.headers(headers) }).pipe(catchError(this.handle));
  }

  delete<T>(path: string, headers?: Record<string, string>): Observable<T> {
    return this.http.delete<T>(`${this.config.apiBase}${path}`, { headers: this.headers(headers) }).pipe(catchError(this.handle));
  }

  url(path: string): string { return `${this.config.apiBase}${path}`; }

  private headers(values?: Record<string, string>): HttpHeaders {
    return new HttpHeaders(values ?? {});
  }

  private handle = (err: HttpErrorResponse) => {
    const msg = (err.error && (err.error.message || err.error.error)) || err.message || 'Request failed';
    return throwError(() => ({ message: String(msg), status: err.status }));
  };
}
