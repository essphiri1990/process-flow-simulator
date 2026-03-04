import { afterEach, describe, expect, it, vi } from 'vitest';

type MessageHandler = (event: { origin: string; data: unknown }) => void;

type MockWindow = {
  location: { search: string };
  parent: { postMessage: ReturnType<typeof vi.fn> } | MockWindow;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  dispatchHostMessage: (origin: string, data: unknown) => void;
};

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

function restoreGlobal(name: 'window' | 'document', descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, name);
}

function setGlobal(name: 'window' | 'document', value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function createMockWindow(options?: { embedded?: boolean; hostOrigin?: string }): MockWindow {
  const embedded = options?.embedded ?? true;
  const hostOrigin = options?.hostOrigin ?? 'https://platform.example';
  const listeners = new Set<MessageHandler>();
  const parent = { postMessage: vi.fn() };

  const mockWindow: MockWindow = {
    location: {
      search: `?pb_host_origin=${encodeURIComponent(hostOrigin)}`,
    },
    parent: embedded ? parent : (undefined as unknown as MockWindow),
    addEventListener: vi.fn((eventType: string, handler: MessageHandler) => {
      if (eventType === 'message') listeners.add(handler);
    }),
    removeEventListener: vi.fn((eventType: string, handler: MessageHandler) => {
      if (eventType === 'message') listeners.delete(handler);
    }),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    dispatchHostMessage(origin: string, data: unknown) {
      listeners.forEach((handler) => handler({ origin, data }));
    },
  };

  if (!embedded) {
    mockWindow.parent = mockWindow;
  }

  return mockWindow;
}

async function loadSdkModule() {
  vi.resetModules();
  return import('../processBoxSdk');
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreGlobal('window', windowDescriptor);
  restoreGlobal('document', documentDescriptor);
});

describe('processBoxSdk client', () => {
  it('returns null when initialized without window context', async () => {
    setGlobal('window', undefined);
    const { initProcessBoxSdk, getProcessBoxSdk } = await loadSdkModule();

    expect(initProcessBoxSdk('process-flow-simulator')).toBeNull();
    expect(getProcessBoxSdk()).toBeNull();
  });

  it('posts cloud save requests to the host bridge when embedded', async () => {
    const mockWindow = createMockWindow({ embedded: true, hostOrigin: 'https://platform.example' });
    setGlobal('window', mockWindow);
    setGlobal('document', { referrer: '' });

    const { initProcessBoxSdk, getProcessBoxSdk } = await loadSdkModule();
    const client = initProcessBoxSdk('process-flow-simulator');

    expect(client).not.toBeNull();
    expect(client?.isEmbedded).toBe(true);
    expect(getProcessBoxSdk()).toBe(client);

    const requestPromise = client!.createCloudSave({
      note: 'Unit test run',
      tier: 'registered',
      state: { score: 42 },
    });

    expect((mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledTimes(1);

    const [requestEnvelope, targetOrigin] =
      (mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls[0];

    expect(targetOrigin).toBe('https://platform.example');
    expect(requestEnvelope.method).toBe('cloudSaves.create');
    expect(requestEnvelope.payload.appId).toBe('process-flow-simulator');
    expect(requestEnvelope.payload.state).toEqual({ score: 42 });

    mockWindow.dispatchHostMessage('https://platform.example', {
      channel: 'process-box-sdk',
      version: '1.0',
      kind: 'response',
      requestId: requestEnvelope.requestId,
      ok: true,
      result: { saveId: 'save_1' },
      error: null,
    });

    await expect(requestPromise).resolves.toEqual({ saveId: 'save_1' });
  });

  it('rejects requests outside embedded mode', async () => {
    const mockWindow = createMockWindow({ embedded: false });
    setGlobal('window', mockWindow);
    setGlobal('document', { referrer: '' });

    const { initProcessBoxSdk } = await loadSdkModule();
    const client = initProcessBoxSdk('process-flow-simulator');

    expect(client?.isEmbedded).toBe(false);
    await expect(client!.trackAppOpened()).rejects.toMatchObject({
      code: 'SDK_UNAVAILABLE',
    });
  });
});
