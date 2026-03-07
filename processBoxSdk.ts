type SavePayload = {
  note?: string;
  state?: Record<string, unknown>;
  tier?: 'guest' | 'registered' | 'premium';
};

type SharedSimListPayload = {
  workspaceId?: string | null;
};

type SharedSimCreatePayload = {
  saveId: string;
  title?: string;
};

type ScoreRunPayload = {
  score: number;
  durationMs?: number | null;
  outcome?: string;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
};

type SessionCreatePayload = {
  sessionName?: string;
  facilitatorName?: string;
  participantName?: string;
  maxParticipants?: number;
  lockAfterStart?: boolean;
  config?: Record<string, unknown>;
};

type SessionJoinPayload = {
  joinCode: string;
  displayName?: string;
  participantToken?: string | null;
};

type SessionScorePayload = {
  participantId?: string | null;
  scoreDelta?: number;
  score?: number | null;
  scoreDetails?: Record<string, unknown>;
};

type RequestEnvelope = {
  channel: 'process-box-sdk';
  version: '1.0';
  kind: 'request';
  requestId: string;
  method: string;
  payload: Record<string, unknown>;
};

type ResponseEnvelope = {
  channel: 'process-box-sdk';
  version: '1.0';
  kind: 'response';
  requestId: string;
  ok: boolean;
  result: any;
  error: { code?: string; message?: string; details?: unknown } | null;
};

const CHANNEL = 'process-box-sdk';
const VERSION = '1.0';
const TIMEOUT_MS = 7000;

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  return window.parent !== window;
}

function resolveTargetOrigin(): string {
  const params = new URLSearchParams(window.location.search);
  const hostOrigin = params.get('pb_host_origin');
  if (hostOrigin) return hostOrigin;

  if (document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      return '*';
    }
  }

  return '*';
}

function parseSdkError(response: ResponseEnvelope): Error {
  const error = new Error(response.error?.message || 'Process Box SDK request failed.');
  (error as Error & { code?: string; details?: unknown }).code = response.error?.code || 'SDK_ERROR';
  (error as Error & { code?: string; details?: unknown }).details = response.error?.details;
  return error;
}

export type ProcessBoxSdkClient = {
  isEmbedded: boolean;
  getContext(): Promise<any>;
  getEntitlements(): Promise<any>;
  trackAppOpened(payload?: Record<string, unknown>): Promise<unknown>;
  trackAppCompleted(payload?: Record<string, unknown>): Promise<unknown>;
  listCloudSaves(limit?: number): Promise<any>;
  createCloudSave(payload: SavePayload): Promise<any>;
  deleteCloudSave(saveId: string): Promise<any>;
  clearCloudSaves(): Promise<any>;
  getSharedSim(): Promise<any>;
  listSharedSims(payload?: SharedSimListPayload): Promise<any>;
  createSharedSim(payload: SharedSimCreatePayload): Promise<any>;
  deleteSharedSim(shareId: string): Promise<any>;
  logScoreRun(payload: ScoreRunPayload): Promise<any>;
  listScoreHistory(limit?: number): Promise<any>;
  getScoreHistoryBest(): Promise<any>;
  getSession(): Promise<any>;
  createSession(payload?: SessionCreatePayload): Promise<any>;
  joinSession(payload: SessionJoinPayload): Promise<any>;
  leaveSession(): Promise<any>;
  startSession(): Promise<any>;
  endSession(): Promise<any>;
  setSessionLock(lockAfterStart: boolean): Promise<any>;
  kickSessionParticipant(participantId: string, reason?: string): Promise<any>;
  getSessionShareLink(): Promise<any>;
  updateSessionScore(payload?: SessionScorePayload): Promise<any>;
};

let singleton: ProcessBoxSdkClient | null = null;

function createClient(appId: string): ProcessBoxSdkClient {
  const embedded = isEmbedded();
  const targetOrigin = resolveTargetOrigin();

  async function request(method: string, payload: Record<string, unknown> = {}): Promise<any> {
    if (!embedded) {
      const err = new Error('Process Box SDK is unavailable outside embedded mode.');
      (err as Error & { code?: string }).code = 'SDK_UNAVAILABLE';
      throw err;
    }

    const requestId = nextId('pb_req');
    const envelope: RequestEnvelope = {
      channel: CHANNEL,
      version: VERSION,
      kind: 'request',
      requestId,
      method,
      payload: {
        appId,
        ...payload,
      },
    };

    return new Promise((resolve, reject) => {
      let resolved = false;

      const finish = (callback: () => void) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('message', onMessage);
        window.clearTimeout(timeoutId);
        callback();
      };

      const onMessage = (event: MessageEvent<ResponseEnvelope>) => {
        if (targetOrigin !== '*' && event.origin !== targetOrigin) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.channel !== CHANNEL || data.version !== VERSION || data.kind !== 'response') return;
        if (data.requestId !== requestId) return;

        if (data.ok) {
          finish(() => resolve(data.result));
          return;
        }

        finish(() => reject(parseSdkError(data)));
      };

      const timeoutId = window.setTimeout(() => {
        finish(() => {
          const err = new Error(`Process Box SDK request timed out: ${method}`);
          (err as Error & { code?: string }).code = 'SDK_TIMEOUT';
          reject(err);
        });
      }, TIMEOUT_MS);

      window.addEventListener('message', onMessage);
      window.parent.postMessage(envelope, targetOrigin);
    });
  }

  return {
    isEmbedded: embedded,
    getContext() {
      return request('context.get');
    },
    getEntitlements() {
      return request('entitlements.get');
    },
    trackAppOpened(payload = {}) {
      return request('analytics.track', { eventName: 'app_opened', payload });
    },
    trackAppCompleted(payload = {}) {
      return request('analytics.track', { eventName: 'app_completed', payload });
    },
    listCloudSaves(limit = 15) {
      return request('cloudSaves.list', { limit });
    },
    createCloudSave(payload) {
      return request('cloudSaves.create', payload || {});
    },
    deleteCloudSave(saveId) {
      return request('cloudSaves.delete', { saveId });
    },
    clearCloudSaves() {
      return request('cloudSaves.clear');
    },
    getSharedSim() {
      return request('sharedSim.get');
    },
    listSharedSims(payload = {}) {
      return request('sharedSims.list', payload || {});
    },
    createSharedSim(payload) {
      return request('sharedSims.create', payload || {});
    },
    deleteSharedSim(shareId) {
      return request('sharedSims.delete', { shareId });
    },
    logScoreRun(payload) {
      return request('history.run.log', payload || {});
    },
    listScoreHistory(limit = 25) {
      return request('history.run.list', { limit });
    },
    getScoreHistoryBest() {
      return request('history.best.get');
    },
    getSession() {
      return request('sessions.get');
    },
    createSession(payload = {}) {
      return request('sessions.create', payload);
    },
    joinSession(payload) {
      return request('sessions.join', payload || {});
    },
    leaveSession() {
      return request('sessions.leave');
    },
    startSession() {
      return request('sessions.start');
    },
    endSession() {
      return request('sessions.end');
    },
    setSessionLock(lockAfterStart) {
      return request('sessions.lock.set', { lockAfterStart: Boolean(lockAfterStart) });
    },
    kickSessionParticipant(participantId, reason = 'Removed by facilitator') {
      return request('sessions.participant.kick', { participantId, reason });
    },
    getSessionShareLink() {
      return request('sessions.shareLink.get');
    },
    updateSessionScore(payload = {}) {
      return request('sessions.score', payload);
    },
  };
}

export function initProcessBoxSdk(appId: string): ProcessBoxSdkClient | null {
  if (singleton) return singleton;
  if (typeof window === 'undefined') return null;
  singleton = createClient(appId);
  return singleton;
}

export function getProcessBoxSdk(): ProcessBoxSdkClient | null {
  return singleton;
}
