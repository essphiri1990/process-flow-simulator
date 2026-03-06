import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls as FlowControls,

  ReactFlowProvider,
  Node,
  Edge,
  Connection,
  ConnectionLineType,
} from 'reactflow';

import { useStore } from './store';
import ProcessNode from './components/ProcessNode';
import StartNode from './components/StartNode';
import EndNode from './components/EndNode';
import ProcessEdge from './components/ProcessEdge';
import AnnotationNode from './components/AnnotationNode';
import Sidebar from './components/Sidebar';
import Controls from './components/Controls';
import ConfigPanel from './components/ConfigPanel';
import ToastContainer from './components/Toast';
import SunMoonCycle from './components/SunMoonCycle';
import Onboarding, { shouldShowOnboarding } from './components/Onboarding';
import ErrorBoundary from './components/ErrorBoundary';
import DebugOverlay from './components/DebugOverlay';
import { computeLeadMetrics } from './metrics';
import { getProcessBoxSdk } from './processBoxSdk';

import { MousePointer2, Info, Menu, BookOpen, PlayCircle, X } from 'lucide-react';

const nodeTypes = {
  processNode: ProcessNode,
  startNode: StartNode,
  endNode: EndNode,
  annotationNode: AnnotationNode,
};

const edgeTypes = {
  processEdge: ProcessEdge,
};

const MODEL_PRIMER_KEY = 'processFlowSim_hideModelPrimer';
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard'));

const ModalLoading = ({ label }: { label: string }) => (
  <div className="fixed inset-0 bg-black/25 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-5 py-3 text-sm font-medium text-slate-600">
      {label}
    </div>
  </div>
);

function ProcessFlowSessionPanel() {
  const sdk = getProcessBoxSdk();
  const throughput = useStore((state) => state.throughput);
  const itemCounts = useStore((state) => state.itemCounts);
  const items = useStore((state) => state.items);
  const metricsWindowCompletions = useStore((state) => state.metricsWindowCompletions);
  const metricsEpoch = useStore((state) => state.metricsEpoch);
  const [sdkContext, setSdkContext] = useState<any | null>(null);
  const [sessionState, setSessionState] = useState<any | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const leadMetrics = useMemo(
    () =>
      computeLeadMetrics(items, {
        windowSize: metricsWindowCompletions,
        metricsEpoch,
      }),
    [items, metricsEpoch, metricsWindowCompletions],
  );

  const scorePayload = useMemo(() => {
    const liveThroughput = Number(throughput.toFixed(2));
    return {
      score: liveThroughput,
      scoreDetails: {
        throughput: liveThroughput,
        leadTime: Number(leadMetrics.avgLeadTime.toFixed(2)),
        wip: itemCounts.wip,
        completed: itemCounts.completed,
      },
    };
  }, [itemCounts.completed, itemCounts.wip, leadMetrics.avgLeadTime, throughput]);

  const refreshSessionUi = useCallback(async () => {
    if (!sdk?.isEmbedded) return;
    try {
      const [context, session] = await Promise.all([sdk.getContext(), sdk.getSession()]);
      setSdkContext(context);
      setSessionState(session);
      setError(null);
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to sync live session.');
    }
  }, [sdk]);

  useEffect(() => {
    if (!sdk?.isEmbedded) return;

    void refreshSessionUi();
    const timer = window.setInterval(() => {
      void refreshSessionUi();
    }, 4000);

    return () => window.clearInterval(timer);
  }, [refreshSessionUi, sdk]);

  const launchMode = sdkContext?.launchMode || 'solo';
  const currentSession = sessionState?.currentSession || null;
  const participant = sessionState?.participant || null;
  const scoreboard = sessionState?.scoreboard || currentSession?.scoreboard || {};
  const participants = sessionState?.participants || [];
  const facilitatorView = launchMode === 'facilitator' || participant?.role === 'facilitator';
  const shouldRender = Boolean(sdk?.isEmbedded && (launchMode !== 'solo' || currentSession));

  const sortedScoreboard = Object.values(scoreboard || {}).sort(
    (left: any, right: any) => Number(right?.score || 0) - Number(left?.score || 0),
  );

  const runAction = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      setBusyAction(label);
      setError(null);
      try {
        await action();
        await refreshSessionUi();
      } catch (nextError: any) {
        setError(nextError?.message || `Failed to ${label}.`);
      } finally {
        setBusyAction(null);
      }
    },
    [refreshSessionUi],
  );

  const handleCopyShareLink = useCallback(() => {
    void runAction('copy', async () => {
      const payload = await sdk?.getSessionShareLink?.();
      const shareLink = payload?.shareLink || currentSession?.shareLink || '';
      if (!shareLink) {
        throw new Error('Create a live session first.');
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }, [currentSession?.shareLink, runAction, sdk]);

  if (!shouldRender) return null;

  return (
    <div className="absolute top-16 right-3 z-30 w-[340px] max-w-[calc(100%-1.5rem)] pointer-events-auto">
      <div className="rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-950 text-white">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Live Session</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              {facilitatorView ? 'Facilitator Mode' : 'Participant Mode'}
            </div>
            {currentSession?.joinCode ? (
              <div className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold tracking-[0.18em]">
                {currentSession.joinCode}
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-4 py-3 space-y-3 text-sm text-slate-700">
          {!currentSession && facilitatorView ? (
            <button
              type="button"
              onClick={() =>
                void runAction('create', () =>
                  sdk!.createSession({
                    sessionName: 'Process Flow Live Session',
                    facilitatorName: sdkContext?.auth?.email || 'Facilitator',
                  }),
                )
              }
              className="w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(busyAction)}
            >
              {busyAction === 'create' ? 'Creating...' : 'Create Live Session'}
            </button>
          ) : null}

          {currentSession ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void runAction(currentSession.state === 'active' ? 'end' : 'start', () =>
                      currentSession.state === 'active' ? sdk!.endSession() : sdk!.startSession(),
                    )
                  }
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={Boolean(busyAction)}
                >
                  {currentSession.state === 'active' ? 'End Session' : 'Start Session'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={Boolean(busyAction)}
                >
                  {copied ? 'Copied' : 'Copy Invite'}
                </button>
              </div>

              {facilitatorView ? (
                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span>Lock after start</span>
                  <input
                    type="checkbox"
                    checked={Boolean(currentSession.lockAfterStart)}
                    onChange={(event) =>
                      void runAction('lock', () => sdk!.setSessionLock(Boolean(event.target.checked)))
                    }
                  />
                </label>
              ) : null}

              <button
                type="button"
                onClick={() => void runAction('score', () => sdk!.updateSessionScore(scorePayload))}
                className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(busyAction)}
              >
                Submit Current Score
              </button>

              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Current Run</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Throughput</div>
                    <div className="font-semibold text-slate-900">{scorePayload.score}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Lead Time</div>
                    <div className="font-semibold text-slate-900">{scorePayload.scoreDetails.leadTime}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">WIP</div>
                    <div className="font-semibold text-slate-900">{scorePayload.scoreDetails.wip}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Participants</div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {participants.map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                      <div>
                        <div className="font-semibold text-slate-900">{entry.name}</div>
                        <div className="text-slate-500">{entry.role}</div>
                      </div>
                      {facilitatorView && entry.role !== 'facilitator' ? (
                        <button
                          type="button"
                          onClick={() => void runAction('kick', () => sdk!.kickSessionParticipant(entry.id))}
                          className="rounded-lg border border-rose-200 px-2 py-1 font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          Kick
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Shared Scoreboard</div>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {sortedScoreboard.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
                      No submissions yet.
                    </div>
                  ) : (
                    sortedScoreboard.map((entry: any, index) => (
                      <div key={entry.participantId} className="rounded-xl border border-slate-200 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-slate-900">
                              {index + 1}. {entry.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Lead {entry.details?.leadTime ?? '-'} · WIP {entry.details?.wip ?? '-'}
                            </div>
                          </div>
                          <div className="text-lg font-bold text-slate-950">{Number(entry.score || 0).toFixed(2)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
              Create a facilitator session to share this simulation live.
            </div>
          )}

          {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

function Flow() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    connect,
    reconnectEdge,
    deleteNode,
    restoreLatestCloudSave,
  } = useStore();

  // Edge reconnection ref to track the edge being updated
  const edgeReconnectSuccessful = useRef(true);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const [showModelPrimer, setShowModelPrimer] = useState(() => !localStorage.getItem(MODEL_PRIMER_KEY));
  const hasRestoredCloudSaveRef = useRef(false);

  useEffect(() => {
    if (hasRestoredCloudSaveRef.current) return;
    hasRestoredCloudSaveRef.current = true;
    restoreLatestCloudSave();
  }, [restoreLatestCloudSave]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Open config for process, start, and end nodes
    if (['processNode', 'startNode', 'endNode'].includes(node.type || '')) {
      setSelectedNodeId(node.id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  const handleNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Double-click opens config panel directly
    if (['processNode', 'startNode', 'endNode'].includes(node.type || '')) {
      setSelectedNodeId(node.id);
      setIsConfigOpen(true);
    }
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setIsConfigOpen(false);
  }, []);

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      deleted.forEach((node) => {
        deleteNode(node.id);
      });
    },
    [deleteNode]
  );

  // Edge reconnection handlers - allows dragging edge endpoints to different nodes
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      reconnectEdge(oldEdge, newConnection);
    },
    [reconnectEdge]
  );

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        // If reconnection failed (dropped in empty space), keep the original edge
        // The edge is already in state, so no action needed
      }
      edgeReconnectSuccessful.current = true;
    },
    []
  );

  const nodesWithSelection = useMemo(() => {
    return nodes.map(n => ({
      ...n,
      selected: n.id === selectedNodeId
    }));
  }, [nodes, selectedNodeId]);

  const runCoffeeQuickStart = useCallback(() => {
    const store = useStore.getState();
    store.loadScenario('coffee');
    store.setDurationPreset('1hour');
    store.setSpeedPreset('1x');
    store.setCountTransitInClock(false);
    store.startSimulation();
  }, []);

  const dismissPrimer = useCallback(() => {
    setShowModelPrimer(false);
    localStorage.setItem(MODEL_PRIMER_KEY, 'true');
  }, []);

  return (
    <div className="w-full h-screen bg-slate-50 relative font-sans text-slate-900 overflow-hidden">

      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Menu Toggle Button */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-3 left-3 z-30 p-2.5 bg-white/90 backdrop-blur-md rounded-xl border border-slate-200/60 shadow-md text-slate-500 hover:text-slate-700 hover:bg-white active:scale-[0.95] transition-all duration-150"
          title="Open Menu"
        >
          <Menu size={18} />
        </button>
      )}

      <DebugOverlay />

      {showModelPrimer && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[680px] w-[calc(100%-180px)]">
          <div className="bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-lg px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <BookOpen size={14} />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">How to Read This Simulation</div>
                  <div className="text-sm text-slate-700 mt-0.5 leading-snug">
                    Clock = elapsed timeline. Lead = queue + processing per completed item. Throughput = end completions/hour from recent window.
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      onClick={runCoffeeQuickStart}
                      className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    >
                      <PlayCircle size={12} />
                      Run Coffee Demo
                    </button>
                    <button
                      onClick={() => setShowOnboarding(true)}
                      className="text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
                    >
                      Open Walkthrough
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={dismissPrimer}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0"
                title="Hide primer"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Button (Top Right) */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        className={`absolute top-3 right-3 z-10 p-2 rounded-lg transition ${
          showHelp ? 'bg-blue-100 text-blue-600' : 'bg-white/80 text-slate-500 hover:bg-white hover:text-slate-700'
        } border border-slate-200 shadow-sm`}
        title="Toggle Help"
      >
        <Info size={16} />
      </button>

      <ProcessFlowSessionPanel />

      {/* Help Panel (Collapsible) */}
      {showHelp && (
        <div className="absolute top-12 right-3 z-10 bg-white/95 backdrop-blur p-3 rounded-xl border border-slate-200 shadow-lg text-xs text-slate-500 max-w-xs animate-in fade-in slide-in-from-right-2 duration-200">
          <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <MousePointer2 size={12} />
            Quick Guide
          </h4>
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Double-click a node to configure it</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Drag from handles to connect nodes</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Drag edge endpoints to reconnect</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Enable "Auto Feed" to generate items automatically</span>
            </li>
          </ul>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white border-2 border-red-500" />
            <span>Red border = Bottleneck (10+ items)</span>
          </div>
        </div>
      )}

      {/* Sun/Moon Cycle */}
      <div className="absolute top-0 right-0 z-10 pointer-events-none">
        <SunMoonCycle />
      </div>

      {/* Main Canvas */}
      <div className="absolute inset-0">
        <ReactFlow
          nodes={nodesWithSelection}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={connect}
          onReconnectStart={onReconnectStart}
          onReconnect={onReconnect}
          onReconnectEnd={onReconnectEnd}
          onNodesDelete={onNodesDelete}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onPaneClick={handlePaneClick}
          fitView
          minZoom={0.1}
          maxZoom={4}
          snapToGrid={true}
          snapGrid={[20, 20]}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5 5' }}
          className="bg-slate-50"
        >
          <Background color="#cbd5e1" gap={20} size={1} />
          <FlowControls className="bg-white shadow-lg border border-slate-200 rounded-lg overflow-hidden" />
        </ReactFlow>
      </div>

      {/* Interface Overlays */}
      <Controls
        selectedNodeId={selectedNodeId}
        onEditNode={() => setIsConfigOpen(true)}
        onOpenAnalytics={() => setIsAnalyticsOpen(true)}
      />


      {isConfigOpen && selectedNodeId && (
        <ConfigPanel
          nodeId={selectedNodeId}
          onClose={() => setIsConfigOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <Suspense fallback={<ModalLoading label="Loading Settings..." />}>
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}

      {isAnalyticsOpen && (
        <Suspense fallback={<ModalLoading label="Loading Analytics..." />}>
          <AnalyticsDashboard onClose={() => setIsAnalyticsOpen(false)} />
        </Suspense>
      )}

      {/* Toast notifications */}
      <ToastContainer />

      {/* First-run onboarding */}
      {showOnboarding && (
        <Onboarding
          onDismiss={() => setShowOnboarding(false)}
          onQuickStart={runCoffeeQuickStart}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}
