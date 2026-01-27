import React, { useCallback, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls as FlowControls,
  MiniMap,
  ReactFlowProvider,
  Node,
} from 'reactflow';

import { useStore } from './store';
import ProcessNode from './components/ProcessNode';
import StartNode from './components/StartNode';
import EndNode from './components/EndNode';
import ProcessEdge from './components/ProcessEdge'; 
import AnnotationNode from './components/AnnotationNode'; 
import Controls from './components/Controls';
import ConfigPanel from './components/ConfigPanel';
import VSMStats from './components/VSMStats'; 
import SettingsModal from './components/SettingsModal';
import AnalyticsDashboard from './components/AnalyticsDashboard';

import { PlusCircle, Layers, MousePointer2, Save, Upload, Download, StickyNote, BookOpen, Settings, Trash2, PlayCircle, StopCircle } from 'lucide-react';

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
    addNode,
    addStartNode,
    addEndNode,
    addAnnotation,
    saveFlow,
    loadFlow,
    exportJson,
    importJson,
    loadScenario,
    clearCanvas,
    deleteNode
  } = useStore();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target?.result as string;
        importJson(content);
    };
    reader.readAsText(file);
  };
  
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      deleted.forEach((node) => {
        deleteNode(node.id);
      });
    },
    [deleteNode]
  );

  const nodesWithSelection = useMemo(() => {
      return nodes.map(n => ({
          ...n,
          selected: n.id === selectedNodeId
      }));
  }, [nodes, selectedNodeId]);

  return (
    <div className="w-full h-screen bg-slate-50 relative font-sans text-slate-900 overflow-hidden">
      
      {/* Top Bar */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border border-slate-200 max-w-sm">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                        <Layers className="text-blue-600" />
                        Process Flow Sim
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Professional Process Modeling Tool
                    </p>
                </div>
                <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition"
                    title="Global Settings (Item Style)"
                >
                    <Settings size={18} />
                </button>
            </div>

            {/* Scenario Selector */}
            <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg">
                <BookOpen size={16} className="text-slate-500"/>
                <select 
                    className="bg-transparent text-sm font-medium text-slate-700 outline-none w-full cursor-pointer"
                    onChange={(e) => loadScenario(e.target.value)}
                    defaultValue="devops"
                >
                    <option value="devops">Scenario: DevOps Pipeline</option>
                    <option value="hospital">Scenario: Hospital ER Triage</option>
                    <option value="manufacturing">Scenario: Manufacturing Line</option>
                    <option value="empty">Empty Canvas</option>
                </select>
            </div>
        </div>
        
        {/* Editing Tools */}
        <div className="flex gap-2">
            <button 
                onClick={addStartNode}
                className="bg-white hover:bg-emerald-50 text-slate-700 font-semibold py-2 px-3 rounded-xl shadow-md border border-slate-200 flex items-center gap-2 transition text-xs"
            >
                <PlayCircle size={16} className="text-emerald-600"/>
                Start
            </button>
            <button 
                onClick={addNode}
                className="bg-white hover:bg-blue-50 text-slate-700 font-semibold py-2 px-3 rounded-xl shadow-md border border-slate-200 flex items-center gap-2 transition text-xs"
            >
                <PlusCircle size={16} className="text-blue-600"/>
                Process
            </button>
            <button 
                onClick={addEndNode}
                className="bg-white hover:bg-slate-100 text-slate-700 font-semibold py-2 px-3 rounded-xl shadow-md border border-slate-200 flex items-center gap-2 transition text-xs"
            >
                <StopCircle size={16} className="text-slate-800"/>
                End
            </button>
            <button
                onClick={addAnnotation}
                className="bg-white hover:bg-yellow-50 text-slate-700 font-semibold py-2 px-3 rounded-xl shadow-md border border-slate-200 flex items-center gap-2 transition text-xs"
            >
                <StickyNote size={16} className="text-yellow-500"/>
                Note
            </button>
        </div>

        {/* Persistence Tools */}
        <div className="flex gap-1 mt-1">
             <button onClick={saveFlow} className="p-2 bg-white hover:bg-slate-100 rounded-lg shadow border border-slate-200 text-slate-600" title="Quick Save to LocalStorage">
                 <Save size={16} />
             </button>
             <button onClick={loadFlow} className="p-2 bg-white hover:bg-slate-100 rounded-lg shadow border border-slate-200 text-slate-600" title="Quick Load from LocalStorage">
                 <Upload size={16} className="rotate-180" />
             </button>
             <div className="w-px h-8 bg-slate-300 mx-1"></div>
             <button onClick={exportJson} className="p-2 bg-white hover:bg-slate-100 rounded-lg shadow border border-slate-200 text-slate-600" title="Export JSON">
                 <Download size={16} />
             </button>
             <button onClick={handleImportClick} className="p-2 bg-white hover:bg-slate-100 rounded-lg shadow border border-slate-200 text-slate-600" title="Import JSON">
                 <Upload size={16} />
             </button>
             <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
             
             <div className="w-px h-8 bg-slate-300 mx-1"></div>
             <button 
                onClick={() => { if(confirm('Clear entire canvas?')) clearCanvas(); }} 
                className="p-2 bg-white hover:bg-red-50 rounded-lg shadow border border-slate-200 text-red-500" 
                title="Clear Canvas"
             >
                 <Trash2 size={16} />
             </button>
        </div>
      </div>

      {/* Legend / Instructions */}
      <div className="absolute top-4 right-4 z-10 bg-white/50 backdrop-blur p-3 rounded-xl border border-slate-200 text-xs text-slate-500 hidden md:block">
          <div className="flex items-center gap-2 mb-1">
             <MousePointer2 size={14} /> Select a node to configure or add items.
          </div>
          <div>Drag handles to connect process flow.</div>
          <div className="mt-2 pt-2 border-t border-slate-200 flex items-center gap-2">
             <div className="w-3 h-3 rounded-full bg-white border-2 border-red-500"></div>
             <span>Red border = Bottleneck (10+ Items)</span>
          </div>
      </div>

      {/* Main Canvas */}
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
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