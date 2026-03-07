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

  it('posts score history run requests to the host bridge when embedded', async () => {
    const mockWindow = createMockWindow({ embedded: true, hostOrigin: 'https://platform.example' });
    setGlobal('window', mockWindow);
    setGlobal('document', { referrer: '' });

    const { initProcessBoxSdk } = await loadSdkModule();
    const client = initProcessBoxSdk('process-flow-simulator');

    const requestPromise = client!.logScoreRun({
      score: 44,
      durationMs: 15000,
      outcome: 'design_saved',
      metadata: { nodeCount: 7, edgeCount: 6 },
    });

    expect((mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledTimes(1);
    const [requestEnvelope, targetOrigin] =
      (mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls[0];

    expect(targetOrigin).toBe('https://platform.example');
    expect(requestEnvelope.method).toBe('history.run.log');
    expect(requestEnvelope.payload.appId).toBe('process-flow-simulator');
    expect(requestEnvelope.payload.score).toBe(44);

    mockWindow.dispatchHostMessage('https://platform.example', {
      channel: 'process-box-sdk',
      version: '1.0',
      kind: 'response',
      requestId: requestEnvelope.requestId,
      ok: true,
      result: { runId: 'run_1' },
      error: null,
    });

    await expect(requestPromise).resolves.toEqual({ runId: 'run_1' });
  });

  it('posts cloud save delete/clear requests to the host bridge when embedded', async () => {
    const mockWindow = createMockWindow({ embedded: true, hostOrigin: 'https://platform.example' });
    setGlobal('window', mockWindow);
    setGlobal('document', { referrer: '' });

    const { initProcessBoxSdk } = await loadSdkModule();
    const client = initProcessBoxSdk('process-flow-simulator');

    const deletePromise = client!.deleteCloudSave('save_99');
    expect((mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledTimes(1);
    const [deleteEnvelope, deleteTargetOrigin] =
      (mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls[0];

    expect(deleteTargetOrigin).toBe('https://platform.example');
    expect(deleteEnvelope.method).toBe('cloudSaves.delete');
    expect(deleteEnvelope.payload.appId).toBe('process-flow-simulator');
    expect(deleteEnvelope.payload.saveId).toBe('save_99');

    mockWindow.dispatchHostMessage('https://platform.example', {
      channel: 'process-box-sdk',
      version: '1.0',
      kind: 'response',
      requestId: deleteEnvelope.requestId,
      ok: true,
      result: { deleted: true },
      error: null,
    });

    await expect(deletePromise).resolves.toEqual({ deleted: true });

    const clearPromise = client!.clearCloudSaves();
    expect((mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledTimes(2);
    const [clearEnvelope, clearTargetOrigin] =
      (mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls[1];

    expect(clearTargetOrigin).toBe('https://platform.example');
    expect(clearEnvelope.method).toBe('cloudSaves.clear');
    expect(clearEnvelope.payload.appId).toBe('process-flow-simulator');

    mockWindow.dispatchHostMessage('https://platform.example', {
      channel: 'process-box-sdk',
      version: '1.0',
      kind: 'response',
      requestId: clearEnvelope.requestId,
      ok: true,
      result: { deletedCount: 4 },
      error: null,
    });

    await expect(clearPromise).resolves.toEqual({ deletedCount: 4 });
  });

  it('posts shared simulation requests to the host bridge when embedded', async () => {
    const mockWindow = createMockWindow({ embedded: true, hostOrigin: 'https://platform.example' });
    setGlobal('window', mockWindow);
    setGlobal('document', { referrer: '' });

    const { initProcessBoxSdk } = await loadSdkModule();
    const client = initProcessBoxSdk('process-flow-simulator');

    const getPromise = client!.getSharedSim();
    const [getEnvelope, getTargetOrigin] =
      (mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls[0];

    expect(getTargetOrigin).toBe('https://platform.example');
    expect(getEnvelope.method).toBe('sharedSim.get');

    mockWindow.dispatchHostMessage('https://platform.example', {
      channel: 'process-box-sdk',
      version: '1.0',
      kind: 'response',
      requestId: getEnvelope.requestId,
      ok: true,
      result: { id: 'share_1' },
      error: null,
    });

    await expect(getPromise).resolves.toEqual({ id: 'share_1' });

    const listPromise = client!.listSharedSims({ workspaceId: 'workspace_1' });
    const [listEnvelope] =
      (mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls[1];

    expect(listEnvelope.method).toBe('sharedSims.list');
    expect(listEnvelope.payload.workspaceId).toBe('workspace_1');

    mockWindow.dispatchHostMessage('https://platform.example', {
      channel: 'process-box-sdk',
      version: '1.0',
      kind: 'response',
      requestId: listEnvelope.requestId,
      ok: true,
      result: { shares: [{ id: 'share_1' }] },
      error: null,
    });

    await expect(listPromise).resolves.toEqual({ shares: [{ id: 'share_1' }] });

    const createPromise = client!.createSharedSim({ saveId: 'save_1', title: 'Coffee Demo' });
    const [createEnvelope] =
      (mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls[2];

    expect(createEnvelope.method).toBe('sharedSims.create');
    expect(createEnvelope.payload.saveId).toBe('save_1');
    expect(createEnvelope.payload.title).toBe('Coffee Demo');

    mockWindow.dispatchHostMessage('https://platform.example', {
      channel: 'process-box-sdk',
      version: '1.0',
      kind: 'response',
      requestId: createEnvelope.requestId,
      ok: true,
      result: { share: { id: 'share_2' } },
      error: null,
    });

    await expect(createPromise).resolves.toEqual({ share: { id: 'share_2' } });

    const deletePromise = client!.deleteSharedSim('share_2');
    const [deleteEnvelope] =
      (mockWindow.parent as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls[3];

    expect(deleteEnvelope.method).toBe('sharedSims.delete');
    expect(deleteEnvelope.payload.shareId).toBe('share_2');

    mockWindow.dispatchHostMessage('https://platform.example', {
      channel: 'process-box-sdk',
      version: '1.0',
      kind: 'response',
      requestId: deleteEnvelope.requestId,
      ok: true,
      result: { deleted: true },
      error: null,
    });

    await expect(deletePromise).resolves.toEqual({ deleted: true });
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
