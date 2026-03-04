type SavePayload = {
  note?: string;
  state?: Record<string, unknown>;
  tier?: 'guest' | 'registered' | 'premium';
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
  trackAppOpened(payload?: Record<string, unknown>): Promise<unknown>;
  trackAppCompleted(payload?: Record<string, unknown>): Promise<unknown>;
  listCloudSaves(limit?: number): Promise<any>;
  createCloudSave(payload: SavePayload): Promise<any>;
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
