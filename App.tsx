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
