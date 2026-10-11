import type {
  Course,
  Assignment,
  Submission,
  Module,
  ModuleItem,
  Announcement,
  DiscussionTopic,
  DiscussionEntry,
  FileUploadResponse,
  ListCoursesParams,
  ListAssignmentsParams,
  ListModulesParams,
  ListAnnouncementsParams,
  SubmitAssignmentParams,
  SubmissionType,
} from './types/canvas.js';


const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_PAGES = 50;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isIdempotent(method?: string): boolean {
  return !method || method.toUpperCase() === 'GET';
}

/** Exponential backoff with jitter; honours Retry-After (seconds) when present. */
export function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  return Math.min(500 * 2 ** attempt, 8_000) + Math.floor(Math.random() * 250);
}

/** Link header format: <url>; rel="next", <url>; rel="last", ... */
export function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/** Turn a Canvas error response into something a person (or model) can act on. */
export function describeApiError(status: number, statusText: string, body: string): string {
  let detail = body.trim();
  try {
    const parsed = JSON.parse(body);
    const messages = Array.isArray(parsed?.errors)
      ? parsed.errors.map((e: { message?: string }) => e?.message).filter(Boolean)
      : [];
    if (messages.length) detail = messages.join('; ');
  } catch {
    // body wasn't JSON; keep the raw text
  }
  if (detail.length > 300) detail = `${detail.slice(0, 300)}…`;

  const hint =
    status === 401 ? ' Your Canvas token is invalid or expired; create a new one in Account → Settings.'
    : status === 403 ? ' Not permitted: the course may restrict this feature, or your role lacks access.'
    : status === 404 ? ' Not found: check the course/assignment ID, or the item may be unpublished.'
    : status === 429 ? ' Canvas rate limit hit; try again shortly.'
    : '';
  return `Canvas API error ${status} ${statusText}: ${detail}.${hint}`;
}

interface CanvasClientConfig {
  baseUrl: string;
  apiToken: string;
}

export class CanvasClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(config: CanvasClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiToken = config.apiToken;
  }

  private authHeaders(extra: HeadersInit = {}): HeadersInit {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  /** fetch with timeout, and retry/backoff on 429 and 5xx. */
  private async fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const retryable = response.status === 429 || response.status >= 500;
        // Only retry idempotent requests on 5xx; 429 means nothing was processed.
        const safeToRetry = response.status === 429 || isIdempotent(options.method);
        if (retryable && safeToRetry && attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt, response.headers.get('retry-after')));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES && isIdempotent(options.method)) {
          await sleep(backoffMs(attempt, null));
          continue;
        }
        break;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Could not reach Canvas at ${this.baseUrl} (${reason})`);
  }

  private async throwApiError(response: Response): Promise<never> {
    const body = await response.text();
    throw new Error(describeApiError(response.status, response.statusText, body));
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const response = await this.fetchWithRetry(url, {
      ...options,
      headers: this.authHeaders(options.headers),
    });
    if (!response.ok) await this.throwApiError(response);
    return response.json() as Promise<T>;
  }

  private parseLinkNext(linkHeader: string | null): string | null {
    return parseLinkNext(linkHeader);
  }

  private async requestAllPages<T>(
    endpoint: string,
    params: object = {}
  ): Promise<T[]> {
    const mergedParams: Record<string, unknown> = { per_page: 100, ...(params as Record<string, unknown>) };
    const initialQuery = this.buildQueryString(mergedParams);
    let url: string | null = `${this.baseUrl}/api/v1${endpoint}${initialQuery}`;

    const results: T[] = [];
    let pages = 0;

    while (url && pages++ < MAX_PAGES) {
      const response: Response = await this.fetchWithRetry(url, { headers: this.authHeaders() });
      if (!response.ok) await this.throwApiError(response);

      const page = (await response.json()) as T[];
      if (Array.isArray(page)) {
        results.push(...page);
      }

      url = this.parseLinkNext(response.headers.get('link'));
      // Never follow a pagination link off the configured Canvas host (token leak guard).
      if (url && new URL(url).origin !== new URL(this.baseUrl).origin) break;
    }

    return results;
  }

  private buildQueryString(params: object): string {
    const searchParams = new URLSearchParams();
    
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(`${key}[]`, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }
    
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  // ==================== COURSES ====================

  async listCourses(params: ListCoursesParams = {}): Promise<Course[]> {
    return this.requestAllPages<Course>('/courses', params);
  }

  async getCourse(courseId: number, include?: string[]): Promise<Course> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Course>(`/courses/${courseId}${query}`);
  }

  // ==================== ASSIGNMENTS ====================

  async listAssignments(
    courseId: number,
    params: ListAssignmentsParams = {}
  ): Promise<Assignment[]> {
    return this.requestAllPages<Assignment>(
      `/courses/${courseId}/assignments`,
      params
    );
  }

  async getAssignment(
    courseId: number,
    assignmentId: number,
    include?: string[]
  ): Promise<Assignment> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Assignment>(
      `/courses/${courseId}/assignments/${assignmentId}${query}`
    );
  }

  // ==================== SUBMISSIONS ====================

  async getSubmission(
    courseId: number,
    assignmentId: number,
    userId: number | 'self' = 'self',
    include?: string[]
  ): Promise<Submission> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}${query}`
    );
  }

  async submitAssignment(
    courseId: number,
    assignmentId: number,
    params: SubmitAssignmentParams
  ): Promise<Submission> {
    const body: Record<string, unknown> = {
      submission: {
        submission_type: params.submission_type,
      },
    };

    if (params.body) {
      body.submission = { ...body.submission as object, body: params.body };
    }
    if (params.url) {
      body.submission = { ...body.submission as object, url: params.url };
    }
    if (params.file_ids) {
      body.submission = { ...body.submission as object, file_ids: params.file_ids };
    }

    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }

  // ==================== FILE UPLOADS ====================

  async initiateFileUpload(
    courseId: number,
    assignmentId: number,
    fileName: string,
    fileSize: number,
    contentType: string
  ): Promise<FileUploadResponse> {
    return this.request<FileUploadResponse>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/self/files`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: fileName,
          size: fileSize,
          content_type: contentType,
        }),
      }
    );
  }

  async uploadFileToUrl(
    uploadUrl: string,
    uploadParams: Record<string, string>,
    fileContent: Uint8Array | string,
    fileName: string,
    contentType: string
  ): Promise<{ id: number; url: string }> {
    const formData = new FormData();
    
    // Add all upload params from Canvas
    for (const [key, value] of Object.entries(uploadParams)) {
      formData.append(key, value);
    }
    
    // Convert to ArrayBuffer for Blob compatibility
    let arrayBuffer: ArrayBuffer;
    if (typeof fileContent === 'string') {
      const encoder = new TextEncoder();
      arrayBuffer = encoder.encode(fileContent).buffer as ArrayBuffer;
    } else {
      arrayBuffer = fileContent.buffer.slice(
        fileContent.byteOffset,
        fileContent.byteOffset + fileContent.byteLength
      ) as ArrayBuffer;
    }
    
    // Add the file
    const blob = new Blob([arrayBuffer], { type: contentType });
    formData.append('file', blob, fileName);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`File upload error: ${response.status} - ${errorBody}`);
    }

    return response.json();
  }

  // ==================== MODULES ====================

  async listModules(
    courseId: number,
    params: ListModulesParams = {}
  ): Promise<Module[]> {
    return this.requestAllPages<Module>(`/courses/${courseId}/modules`, params);
  }

  async getModule(
    courseId: number,
    moduleId: number,
    include?: string[]
  ): Promise<Module> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Module>(
      `/courses/${courseId}/modules/${moduleId}${query}`
    );
  }

  async listModuleItems(
    courseId: number,
    moduleId: number,
    include?: string[]
  ): Promise<ModuleItem[]> {
    return this.requestAllPages<ModuleItem>(
      `/courses/${courseId}/modules/${moduleId}/items`,
      include ? { include } : {}
    );
  }

  // ==================== ANNOUNCEMENTS ====================

  async listAnnouncements(
    params: ListAnnouncementsParams
  ): Promise<Announcement[]> {
    return this.requestAllPages<Announcement>('/announcements', params);
  }

  // ==================== DISCUSSIONS ====================

  async listDiscussionTopics(
    courseId: number,
    orderBy?: 'position' | 'recent_activity' | 'title'
  ): Promise<DiscussionTopic[]> {
    return this.requestAllPages<DiscussionTopic>(
      `/courses/${courseId}/discussion_topics`,
      orderBy ? { order_by: orderBy } : {}
    );
  }

  async getDiscussionTopic(
    courseId: number,
    topicId: number
  ): Promise<DiscussionTopic> {
    return this.request<DiscussionTopic>(
      `/courses/${courseId}/discussion_topics/${topicId}`
    );
  }

  async listDiscussionEntries(
    courseId: number,
    topicId: number
  ): Promise<DiscussionEntry[]> {
    return this.requestAllPages<DiscussionEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries`
    );
  }

  async postDiscussionEntry(
    courseId: number,
    topicId: number,
    message: string
  ): Promise<DiscussionEntry> {
    return this.request<DiscussionEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries`,
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      }
    );
  }

  async replyToDiscussionEntry(
    courseId: number,
    topicId: number,
    entryId: number,
    message: string
  ): Promise<DiscussionEntry> {
    return this.request<DiscussionEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries/${entryId}/replies`,
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      }
    );
  }

  // ==================== RUBRICS ====================

  async getRubric(
    courseId: number,
    rubricId: number,
    include?: ('assessments' | 'graded_assessments' | 'peer_assessments' | 'associations' | 'assignment_associations' | 'course_associations' | 'account_associations')[]
  ): Promise<unknown> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<unknown>(
      `/courses/${courseId}/rubrics/${rubricId}${query}`
    );
  }

  // ==================== SEARCH / UTILITY ====================

  async searchCourseContent(
    courseId: number,
    searchTerm: string
  ): Promise<{ modules: Module[]; assignments: Assignment[] }> {
    // Search modules
    const modules = await this.listModules(courseId, {
      search_term: searchTerm,
      include: ['items'],
    });

    // Search assignments
    const assignments = await this.listAssignments(courseId, {
      search_term: searchTerm,
    });

    return { modules, assignments };
  }

  async getUpcomingAssignments(
    courseId: number,
    daysAhead: number = 7
  ): Promise<Assignment[]> {
    const assignments = await this.listAssignments(courseId, {
      bucket: 'upcoming',
      include: ['submission'],
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    return assignments.filter(a => {
      if (!a.due_at) return false;
      const dueDate = new Date(a.due_at);
      return dueDate <= cutoffDate;
    });
  }

  async getOverdueAssignments(courseId: number): Promise<Assignment[]> {
    return this.listAssignments(courseId, {
      bucket: 'overdue',
      include: ['submission'],
    });
  }

  async getAssignmentsByDateRange(
    courseId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Assignment[]> {
    const assignments = await this.listAssignments(courseId, {
      include: ['submission'],
    });

    return assignments.filter(a => {
      if (!a.due_at) return false;
      const dueDate = new Date(a.due_at);
      return dueDate >= startDate && dueDate <= endDate;
    });
  }

  // ==================== GRADES / TODO / CALENDAR ====================

  async listMyEnrollments(): Promise<Record<string, any>[]> {
    return this.requestAllPages('/users/self/enrollments', {
      state: ['active'],
      type: ['StudentEnrollment'],
    });
  }

  async listTodo(): Promise<Record<string, any>[]> {
    return this.requestAllPages('/users/self/todo');
  }

  async listCalendarEvents(params: {
    type?: 'event' | 'assignment';
    start_date?: string;
    end_date?: string;
    context_codes?: string[];
  }): Promise<Record<string, any>[]> {
    return this.requestAllPages('/calendar_events', params);
  }

  // ==================== PAGES / FILES / QUIZZES / INBOX ====================

  async listPages(courseId: number, searchTerm?: string): Promise<Record<string, any>[]> {
    return this.requestAllPages(`/courses/${courseId}/pages`, {
      sort: 'updated_at',
      order: 'desc',
      search_term: searchTerm,
    });
  }

  async getPage(courseId: number, pageUrlOrId: string): Promise<Record<string, any>> {
    return this.request(`/courses/${courseId}/pages/${encodeURIComponent(pageUrlOrId)}`);
  }

  async listFiles(courseId: number, searchTerm?: string): Promise<Record<string, any>[]> {
    return this.requestAllPages(`/courses/${courseId}/files`, {
      search_term: searchTerm,
      sort: 'updated_at',
      order: 'desc',
    });
  }

  async getFile(fileId: number): Promise<Record<string, any>> {
    return this.request(`/files/${fileId}`);
  }

  /** Download a file's bytes. The signed URL Canvas returns lives on a different host, so no auth header. */
  async downloadFile(url: string, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
    const response = await this.fetchWithRetry(url, {});
    if (!response.ok) await this.throwApiError(response);
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.length > maxBytes
      ? { bytes: buffer.slice(0, maxBytes), truncated: true }
      : { bytes: buffer, truncated: false };
  }

  async listQuizzes(courseId: number): Promise<Record<string, any>[]> {
    return this.requestAllPages(`/courses/${courseId}/quizzes`);
  }

  async listConversations(scope?: 'unread' | 'starred' | 'sent' | 'archived'): Promise<Record<string, any>[]> {
    // Inbox can be huge; only fetch the first page.
    return this.request(`/conversations${this.buildQueryString({ scope, per_page: 25 })}`);
  }

  async getConversation(conversationId: number): Promise<Record<string, any>> {
    return this.request(`/conversations/${conversationId}`);
  }

  // ==================== USER INFO ====================

  async getCurrentUser(): Promise<{ id: number; name: string; email?: string }> {
    return this.request<{ id: number; name: string; email?: string }>('/users/self');
  }
}

// Singleton instance creator
let clientInstance: CanvasClient | null = null;

export function getCanvasClient(): CanvasClient {
  if (!clientInstance) {
    const baseUrl = process.env.CANVAS_BASE_URL;
    const apiToken = process.env.CANVAS_API_TOKEN;

    if (!baseUrl || !apiToken) {
      throw new Error(
        'Missing required environment variables: CANVAS_BASE_URL and CANVAS_API_TOKEN must be set'
      );
    }

    clientInstance = new CanvasClient({ baseUrl, apiToken });
  }

  return clientInstance;
}
