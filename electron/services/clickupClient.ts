import type { FolderInfo, ListInfo, ScopeTreeTeam, TaskInfo, TeamInfo, TimeEntry } from '../../src/shared/types';

const DEFAULT_BASE_URL = 'https://api.clickup.com/api/v2';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 4;

export class ClickUpApiError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ClickUpApiError';
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.err === 'string') return candidate.err;
  if (typeof candidate.message === 'string') return candidate.message;
  return fallback;
};

const parseDurationMs = (duration: unknown): number => {
  if (typeof duration === 'number' && Number.isFinite(duration)) return Math.abs(duration);
  if (typeof duration === 'string') {
    const parsed = Number(duration);
    if (Number.isFinite(parsed)) return Math.abs(parsed);
  }
  return 0;
};

const parseOptionalMs = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const extractTaskId = (raw: Record<string, unknown>): string | undefined => {
  if (typeof raw.task_id === 'string') return raw.task_id;
  const task = raw.task;
  if (task && typeof task === 'object' && typeof (task as Record<string, unknown>).id === 'string') {
    return (task as Record<string, string>).id;
  }
  return undefined;
};

const getStableFallbackEntryId = (raw: Record<string, unknown>): string => {
  const taskId = extractTaskId(raw) ?? 'no-task';
  const start = parseOptionalMs(raw.start) ?? 0;
  const end = parseOptionalMs(raw.end) ?? 0;
  const duration = parseDurationMs(raw.duration);
  const userId =
    typeof raw.userid === 'string' ? raw.userid : typeof raw.userid === 'number' ? String(raw.userid) : 'no-user';
  return `${taskId}:${userId}:${start}:${end}:${duration}`;
};

const extractUserIdsFromUserArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const ids = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return undefined;
      const record = entry as Record<string, unknown>;

      if (record.user && typeof record.user === 'object') {
        const userId = (record.user as Record<string, unknown>).id;
        if (typeof userId === 'string' || typeof userId === 'number') return String(userId);
      }

      if (typeof record.id === 'string' || typeof record.id === 'number') return String(record.id);
      return undefined;
    })
    .filter((id): id is string => Boolean(id));

  return [...new Set(ids)];
};

const ASSIGNEE_QUERY_UNASSIGNED = '__UNASSIGNED__';
const ASSIGNEE_QUERY_NONE = '__NONE__';

const buildAssigneeQueryValues = (assigneeIds?: string[]): string[] => {
  const normalized = [...new Set((assigneeIds ?? []).map((id) => id.trim()).filter((id) => id.length > 0))];
  if (normalized.length === 0) {
    return [ASSIGNEE_QUERY_NONE];
  }

  // Query named assignees, unassigned tasks, and one unfiltered pass to avoid API edge omissions.
  return [...normalized, ASSIGNEE_QUERY_UNASSIGNED, ASSIGNEE_QUERY_NONE];
};

export class ClickUpClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string, baseUrl = process.env.VITE_CLICKUP_API_BASE_URL ?? DEFAULT_BASE_URL) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }

    const url = `${this.baseUrl}${path}${params.size ? `?${params.toString()}` : ''}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: this.token,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        const isJson = response.headers.get('content-type')?.includes('application/json');
        const payload = isJson ? await response.json() : null;

        if (response.ok) {
          return payload as T;
        }

        if (response.status === 401) {
          throw new ClickUpApiError('Invalid or revoked ClickUp token.', 401, 'UNAUTHORIZED');
        }

        if (response.status === 403) {
          throw new ClickUpApiError('Token is valid but lacks required permissions for this scope.', 403, 'FORBIDDEN');
        }

        if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
          await sleep(250 * 2 ** (attempt - 1));
          continue;
        }

        const errorMessage = normalizeErrorMessage(payload, `ClickUp API request failed (${response.status})`);
        throw new ClickUpApiError(errorMessage, response.status);
      } catch (error) {
        clearTimeout(timeout);

        const isRetriableError =
          error instanceof ClickUpApiError
            ? error.status === 429 || (typeof error.status === 'number' && error.status >= 500)
            : true;

        if (attempt < MAX_ATTEMPTS && isRetriableError) {
          await sleep(250 * 2 ** (attempt - 1));
          continue;
        }

        if (error instanceof ClickUpApiError) {
          throw error;
        }

        throw new ClickUpApiError('Network error while contacting ClickUp API.');
      }
    }

    throw new ClickUpApiError('Unexpected API error.');
  }

  async getTeams(): Promise<TeamInfo[]> {
    const payload = await this.request<{ teams?: Array<{ id: string; name: string }> }>('/team');
    return (payload.teams ?? []).map((team) => ({ id: String(team.id), name: team.name }));
  }

  async getTeamMemberIds(teamId: string): Promise<string[]> {
    const payload = await this.request<{ teams?: Array<Record<string, unknown>> }>('/team');

    const team = (payload.teams ?? []).find((item) => String(item.id) === String(teamId));
    if (!team) return [];

    const ids = [
      ...extractUserIdsFromUserArray(team.members),
      ...extractUserIdsFromUserArray(team.guests),
      ...extractUserIdsFromUserArray(team.users),
      ...extractUserIdsFromUserArray(team.member_guests),
      ...extractUserIdsFromUserArray(team.member_invites)
    ];

    return [...new Set(ids)];
  }

  async getFolders(teamId: string): Promise<FolderInfo[]> {
    const payload = await this.request<{ folders?: Array<{ id: string; name: string }> }>(`/team/${teamId}/folder`, {
      archived: 'false'
    });

    return (payload.folders ?? []).map((folder) => ({
      id: String(folder.id),
      name: folder.name,
      teamId
    }));
  }

  async getLists(folderId: string, teamId: string): Promise<ListInfo[]> {
    const payload = await this.request<{ lists?: Array<{ id: string; name: string }> }>(`/folder/${folderId}/list`, {
      archived: 'false'
    });

    return (payload.lists ?? []).map((list) => ({
      id: String(list.id),
      name: list.name,
      folderId,
      teamId
    }));
  }

  async getAllListsByTeam(teamId: string): Promise<ListInfo[]> {
    const folders = await this.getFolders(teamId);
    const nestedLists = await Promise.all(
      folders.map(async (folder) => {
        const lists = await this.getLists(folder.id, teamId);
        return lists;
      })
    );

    return nestedLists.flat();
  }

  async getTasks(listId: string): Promise<TaskInfo[]> {
    const tasks: TaskInfo[] = [];
    let page = 0;

    while (page < 200) {
      const payload = await this.request<{
        tasks?: Array<{ id: string; name: string }>;
        last_page?: boolean;
      }>(`/list/${listId}/task`, {
        archived: 'false',
        include_closed: 'true',
        page
      });

      const chunk = (payload.tasks ?? []).map((task) => ({
        id: String(task.id),
        name: task.name,
        listId
      }));
      tasks.push(...chunk);

      if (payload.last_page || chunk.length === 0) break;
      page += 1;
    }

    return tasks;
  }

  async getScopeTree(): Promise<ScopeTreeTeam[]> {
    const teams = await this.getTeams();

    return Promise.all(
      teams.map(async (team) => {
        const folders = await this.getFolders(team.id);
        const foldersWithLists = await Promise.all(
          folders.map(async (folder) => {
            const lists = await this.getLists(folder.id, team.id);
            return {
              ...folder,
              lists
            };
          })
        );

        return {
          ...team,
          folders: foldersWithLists
        };
      })
    );
  }

  async getTimeEntries(params: {
    teamId: string;
    startMs?: number;
    endMs?: number;
    folderId?: string;
    listId?: string;
    assigneeIds?: string[];
  }): Promise<TimeEntry[]> {
    const entries: TimeEntry[] = [];
    const seenIds = new Set<string>();
    const assigneeQueryValues = buildAssigneeQueryValues(params.assigneeIds);

    for (const assigneeQueryValue of assigneeQueryValues) {
      let page = 0;
      let cursor: string | undefined;
      let guard = 0;

      const assigneeValue =
        assigneeQueryValue === ASSIGNEE_QUERY_UNASSIGNED
          ? '0'
          : assigneeQueryValue === ASSIGNEE_QUERY_NONE
            ? undefined
            : assigneeQueryValue;

      while (guard < 200) {
        guard += 1;

        const query: Record<string, string | number | boolean | undefined> = {
          start_date: params.startMs,
          end_date: params.endMs,
          folder_id: params.folderId,
          list_id: params.listId,
          assignee: assigneeValue,
          include_task_tags: 'true'
        };

        if (cursor) {
          query.cursor = cursor;
        } else {
          query.page = page;
        }

        const payload = await this.request<Record<string, unknown>>(
          `/team/${params.teamId}/time_entries`,
          query
        );

        const rawEntries =
          (Array.isArray(payload.data) ? payload.data : undefined) ??
          (Array.isArray(payload.time_entries) ? payload.time_entries : undefined) ??
          [];

        for (const item of rawEntries) {
          if (!item || typeof item !== 'object') continue;

          const raw = item as Record<string, unknown>;
          const id = typeof raw.id === 'string' ? raw.id : getStableFallbackEntryId(raw);
          if (seenIds.has(id)) continue;

          seenIds.add(id);

          entries.push({
            id,
            taskId: extractTaskId(raw),
            durationMs: parseDurationMs(raw.duration),
            startMs: parseOptionalMs(raw.start),
            endMs: parseOptionalMs(raw.end),
            userId:
              typeof raw.userid === 'string'
                ? raw.userid
                : typeof raw.userid === 'number'
                  ? String(raw.userid)
                  : undefined,
            raw
          });
        }

        const nextCursor = typeof payload.next_cursor === 'string' ? payload.next_cursor : undefined;
        if (nextCursor) {
          cursor = nextCursor;
          continue;
        }

        const nextPage = typeof payload.next_page === 'number' ? payload.next_page : undefined;
        if (typeof nextPage === 'number') {
          if (nextPage <= page) break;
          page = nextPage;
          continue;
        }

        const lastPage = typeof payload.last_page === 'number' ? payload.last_page : undefined;
        if (typeof lastPage === 'number') {
          if (page < lastPage) {
            page += 1;
            continue;
          }
        }

        break;
      }
    }

    return entries;
  }
}
