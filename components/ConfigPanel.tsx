import React, { useState } from 'react';
import { useStore } from '../store';
import { X, HelpCircle, Split, Zap, Trash2, RotateCcw } from 'lucide-react';
import {
  getTimeUnitAbbrev,
  getTimeUnitPlural,
  ProcessNodeData,
  NODE_HEADER_COLORS,
  DEMAND_UNIT_LABELS,
  DEFAULT_WORKING_HOURS,
  WorkingHoursConfig,
} from '../types';
import ConfirmDialog from './ConfirmDialog';

interface ConfigPanelProps {
  nodeId: string | null;
  onClose: () => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ nodeId, onClose }) => {
  const node = useStore((state) => state.nodes.find((n) => n.id === nodeId));
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const deleteNode = useStore((state) => state.deleteNode);
  const defaultHeaderColor = useStore((state) => state.defaultHeaderColor);
  const timeUnit = useStore((state) => state.timeUnit);
  const demandMode = useStore((state) => state.demandMode);
  const demandUnit = useStore((state) => state.demandUnit);
  const unitAbbrev = getTimeUnitAbbrev(timeUnit);
  const unitPlural = getTimeUnitPlural(timeUnit);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!node) return null;

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleChange = (key: string, value: any) => {
    updateNodeData(node.id, { [key]: value });
  };

  // --- PROCESS / START / END NODE CONFIGURATION ---

  // Find outgoing connections for routing logic
  const outgoingEdges = edges.filter(e => e.source === node.id);

  // Logic helpers
  const isStartNode = node.type === 'startNode';
  const isEndNode = node.type === 'endNode';
  const isStandardNode = node.type === 'processNode';

  // Cast data for process-like nodes (processNode, startNode, endNode all use ProcessNodeData)
  const data = node.data as ProcessNodeData;
  const workingHours = data.workingHours
    ? { ...DEFAULT_WORKING_HOURS, ...data.workingHours }
    : { ...DEFAULT_WORKING_HOURS };

  // Calculate current routing weights for display
  const currentWeights = data.routingWeights || {};
  const totalWeight = outgoingEdges.reduce((sum, e) => sum + (currentWeights[e.target] ?? 1), 0);

  // Source config (init if undefined)
  const sourceConfig = data.sourceConfig || { enabled: false, interval: 20, batchSize: 1 };

  const handleWeightChange = (targetId: string, value: number) => {
    const newWeights = { ...currentWeights, [targetId]: value };
    updateNodeData(node.id, { routingWeights: newWeights });
  };

  const handleSourceChange = (key: string, value: any) => {
      const newSourceConfig = { ...sourceConfig, [key]: value };
      updateNodeData(node.id, { sourceConfig: newSourceConfig });
  };

  const updateWorkingHours = (patch: Partial<WorkingHoursConfig>) => {
    const next = { ...workingHours, ...patch };
    updateNodeData(node.id, { workingHours: next });
  };

  return (
    <div className="absolute right-3 top-3 bottom-[80px] w-80 bg-white shadow-2xl rounded-xl border border-slate-200 z-40 flex flex-col transform transition-transform duration-300 ease-in-out overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Configuration</h2>
          <p className="text-xs text-slate-500">Edit Node Parameters</p>
        </div>
        <div className="flex gap-1">
            <button onClick={handleDelete} className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500" title="Delete Node">
                <Trash2 size={20} />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500">
                <X size={20} />
            </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Label */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Node Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
            value={node.data.label}
            onChange={(e) => handleChange('label', e.target.value)}
          />
        </div>

        {/* Header Color */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Header Color</label>
          <div className="flex flex-wrap gap-2">
            {/* Default (reset) option */}
            <button
              onClick={() => handleChange('headerColor', undefined)}
              className={`w-7 h-7 rounded-full border-2 transition transform hover:scale-110 flex items-center justify-center ${!data.headerColor ? 'border-slate-800 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-slate-300 border-dashed'}`}
              style={{ backgroundColor: defaultHeaderColor + '30' }}
              title="Use global default"
            >
              <RotateCcw size={10} className="text-slate-500" />
            </button>
            {NODE_HEADER_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleChange('headerColor', color)}
                className={`w-7 h-7 rounded-full border-2 shadow-sm transition transform hover:scale-110 ${data.headerColor === color ? 'border-slate-800 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-white'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <p className="text-xs text-slate-400">{data.headerColor ? 'Custom color for this node' : 'Using global default'}</p>
        </div>

        {/* Source Configuration (Start Nodes Only) */}
        {(isStartNode || (isStandardNode && !edges.some(e => e.target === node.id))) && (
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 space-y-3">
                 <div className="flex items-center gap-2 text-emerald-800">
                    <Zap size={16} />
                    <span className="text-sm font-bold">Input Configuration</span>
                 </div>
                 
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        checked={sourceConfig.enabled}
                        onChange={(e) => handleSourceChange('enabled', e.target.checked)}
                        disabled={demandMode === 'target'}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                    />
                    <label className="text-sm text-slate-700 font-medium">Generate Items</label>
                 </div>

                 {sourceConfig.enabled && (
                     <>
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-600">Arrival Interval</span>
                                <span className="font-bold text-emerald-700">{sourceConfig.interval} {unitAbbrev}</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                disabled={demandMode === 'target'}
                                className="w-full h-1.5 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 disabled:opacity-50"
                                value={sourceConfig.interval}
                                onChange={(e) => handleSourceChange('interval', parseInt(e.target.value))}
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-600">Batch Size</span>
                                <span className="font-bold text-emerald-700">{sourceConfig.batchSize}</span>
                            </div>
                             <input
                                type="range"
                                min="1"
                                max="10"
                                disabled={demandMode === 'target'}
                                className="w-full h-1.5 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 disabled:opacity-50"
                                value={sourceConfig.batchSize}
                                onChange={(e) => handleSourceChange('batchSize', parseInt(e.target.value))}
                            />
                        </div>
                     </>
                 )}

                {isStartNode && (
                  <div className="space-y-2 pt-2 border-t border-emerald-100">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Demand Target</span>
                      <span className="font-bold text-emerald-700">{data.demandTarget || 0} / {DEMAND_UNIT_LABELS[demandUnit]}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      className="w-full px-2 py-1 border border-emerald-200 rounded text-sm text-slate-700 focus:ring-2 focus:ring-emerald-400 outline-none"
                      value={data.demandTarget || 0}
                      onChange={(e) => handleChange('demandTarget', Math.max(0, parseInt(e.target.value || '0')))}
                    />
                    <p className="text-xs text-slate-400">Used when Demand Mode is set to Target.</p>
                  </div>
                )}
            </div>
        )}

        {(isStartNode || isStandardNode || isEndNode) && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <HelpCircle size={16} />
              <span className="text-sm font-bold">Working Hours</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={workingHours.enabled}
                onChange={(e) => updateWorkingHours({ enabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-slate-700 focus:ring-slate-400"
              />
              <label className="text-sm text-slate-700 font-medium">Apply working hours</label>
            </div>

            {workingHours.enabled && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Hours per workday</span>
                    <span className="font-bold text-slate-700">{workingHours.hoursPerDay}h</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="1"
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                    value={workingHours.hoursPerDay}
                    onChange={(e) => updateWorkingHours({ hoursPerDay: parseInt(e.target.value, 10) })}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Workdays per week</span>
                    <span className="font-bold text-slate-700">{workingHours.daysPerWeek}/5</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="1"
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                    value={workingHours.daysPerWeek}
                    onChange={(e) => updateWorkingHours({ daysPerWeek: parseInt(e.target.value, 10) })}
                  />
                </div>

                <p className="text-xs text-slate-400">
                  Workday length is 8 hours; demand and processing only occur during open hours.
                </p>
              </>
            )}
          </div>
        )}

        {/* Processing Time */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
             <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Processing Time</label>
             <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{data.processingTime} {unitAbbrev}</span>
          </div>
          <input
            type="range"
            min={isEndNode ? "0" : "1"}
            max="50"
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            value={data.processingTime}
            onChange={(e) => handleChange('processingTime', parseInt(e.target.value))}
          />
          <p className="text-xs text-slate-400">Time required to process one item (in {unitPlural}).</p>
        </div>

        {/* Variability (Hide for EndNode) */}
        {!isEndNode && (
            <div className="space-y-2">
            <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Variability</label>
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                  {Math.round((data.variability || 0) * 100)}%
                </span>
            </div>
            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                value={data.variability || 0}
                onChange={(e) => handleChange('variability', parseFloat(e.target.value))}
            />
            <p className="text-xs text-slate-400">
              How much processing time varies per item. 0% = fixed, 50% = +/- half the base time.
            </p>
            </div>
        )}

        {/* Resources (Hide for EndNode if it's infinite, or allow editing if user wants to simulate a bottleneck at the end) */}
        {!isEndNode && (
            <div className="space-y-2">
            <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Capacity (Resources)</label>
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{data.resources}</span>
            </div>
            <input
                type="range"
                min="1"
                max="10"
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                value={data.resources}
                onChange={(e) => handleChange('resources', parseInt(e.target.value))}
            />
            <p className="text-xs text-slate-400">Number of items that can be processed simultaneously.</p>
            </div>
        )}

        {/* Quality (Hide for EndNode) */}
        {!isEndNode && (
            <div className="space-y-2">
            <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quality (Pass Rate)</label>
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{Math.round(data.quality * 100)}%</span>
            </div>
            <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                value={data.quality}
                onChange={(e) => handleChange('quality', parseFloat(e.target.value))}
            />
            <p className="text-xs text-slate-400">Probability of an item passing this stage successfully.</p>
            </div>
        )}

        {/* Routing Logic (Only if multiple outputs) */}
        {!isEndNode && outgoingEdges.length > 1 && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
             <div className="flex items-center gap-2 text-slate-700">
                <Split size={16} />
                <span className="text-sm font-bold">Routing Logic</span>
             </div>
             <p className="text-xs text-slate-500">Distribution of items passing to next stages.</p>
             
             <div className="space-y-3 pt-2">
               {outgoingEdges.map(edge => {
                 const targetNode = nodes.find(n => n.id === edge.target);
                 const weight = currentWeights[edge.target] ?? 1;
                 const percentage = Math.round((weight / totalWeight) * 100);

                 return (
                   <div key={edge.target} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-700 truncate max-w-[150px]">{targetNode?.data.label || 'Unknown'}</span>
                        <span className="text-blue-600">{percentage}%</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <input 
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={weight}
                          onChange={(e) => handleWeightChange(edge.target, parseInt(e.target.value))}
                          className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        />
                      </div>
                   </div>
                 );
               })}
             </div>
          </div>
        )}

      </div>
      
      {/* Footer Instructions */}
      <div className="p-4 bg-blue-50 border-t border-blue-100 text-blue-800 text-xs flex gap-2">
          <HelpCircle size={16} className="shrink-0" />
          <p>
            Adjusting these values during a simulation affects items entering the node <strong>next</strong>. Current items are unaffected. Metrics reset and will warm up based on new items.
          </p>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Node"
          message={`Delete "${node.data.label}"? This will also remove all connected edges and items at this node.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            deleteNode(node.id);
            setShowDeleteConfirm(false);
            onClose();
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
};

export default ConfigPanel;
