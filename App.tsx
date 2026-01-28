import React, { useCallback, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls as FlowControls,
  MiniMap,
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
import Header from './components/Header';
import Controls from './components/Controls';
import ConfigPanel from './components/ConfigPanel';
import VSMStats from './components/VSMStats';
import SettingsModal from './components/SettingsModal';
import AnalyticsDashboard from './components/AnalyticsDashboard';

import { MousePointer2, Info } from 'lucide-react';

const nodeTypes = {
  processNode: ProcessNode,
  startNode: StartNode,
  endNode: EndNode,
  annotationNode: AnnotationNode,
};

const edgeTypes = {
  processEdge: ProcessEdge,
};

function Flow() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    connect,
    reconnectEdge,
    deleteNode
  } = useStore();

  // Edge reconnection ref to track the edge being updated
  const edgeReconnectSuccessful = useRef(true);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Open config for process, start, and end nodes
    if (['processNode', 'startNode', 'endNode'].includes(node.type || '')) {
      setSelectedNodeId(node.id);
    } else {
      setSelectedNodeId(null);
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

  return (
    <div className="w-full h-screen bg-slate-50 relative font-sans text-slate-900 overflow-hidden">

      {/* Top Header */}
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Help Button (Top Right) */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        className={`absolute top-16 right-4 z-10 p-2 rounded-lg transition ${
          showHelp ? 'bg-blue-100 text-blue-600' : 'bg-white/80 text-slate-500 hover:bg-white hover:text-slate-700'
        } border border-slate-200 shadow-sm`}
        title="Toggle Help"
      >
        <Info size={16} />
      </button>

      {/* Help Panel (Collapsible) */}
      {showHelp && (
        <div className="absolute top-16 right-14 z-10 bg-white/95 backdrop-blur p-3 rounded-xl border border-slate-200 shadow-lg text-xs text-slate-500 max-w-xs animate-in fade-in slide-in-from-right-2 duration-200">
          <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <MousePointer2 size={12} />
            Quick Guide
          </h4>
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Click a node to configure it</span>
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
              <span>Enable "Inputs" to auto-generate items</span>
            </li>
          </ul>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white border-2 border-red-500" />
            <span>Red border = Bottleneck (10+ items)</span>
          </div>
        </div>
      )}

      {/* Main Canvas */}
      <div className="absolute inset-0 pt-14">
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
          <MiniMap
            className="border border-slate-200 rounded-lg shadow-lg"
            nodeColor={(n) => {
              if (n.type === 'annotationNode') return '#fde047';
              if (n.type === 'startNode') return '#10b981';
              if (n.type === 'endNode') return '#1e293b';
              return '#3b82f6';
            }}
            maskColor="rgba(241, 245, 249, 0.7)"
          />
        </ReactFlow>
      </div>

      {/* Interface Overlays */}
      <Controls
        selectedNodeId={selectedNodeId}
        onEditNode={() => setIsConfigOpen(true)}
        onOpenAnalytics={() => setIsAnalyticsOpen(true)}
      />

      <VSMStats onOpenAnalytics={() => setIsAnalyticsOpen(true)} />

      {isConfigOpen && selectedNodeId && (
        <ConfigPanel
          nodeId={selectedNodeId}
          onClose={() => setIsConfigOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}

      {isAnalyticsOpen && (
        <AnalyticsDashboard onClose={() => setIsAnalyticsOpen(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
