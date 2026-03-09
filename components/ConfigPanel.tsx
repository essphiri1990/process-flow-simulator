import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { X, HelpCircle, Split, Zap, Trash2, RotateCcw } from 'lucide-react';
import {
  getTimeUnitAbbrev,
  ProcessNodeData,
  NODE_HEADER_COLORS,
  DEMAND_UNIT_LABELS,
  DEFAULT_WORKING_HOURS,
  WorkingHoursConfig,
} from '../types';
import { clampAllocationPercent, getLocalCapacityUnits, getNodeCapacityProfile, getSharedAllocationTotals } from '../capacityModel';
import ConfirmDialog from './ConfirmDialog';

interface ConfigPanelProps {
  nodeId: string | null;
  onClose: () => void;
}

type ProcessingTimeUnit = 'minutes' | 'hours' | 'days';

const getProcessingTimeUnit = (ticks: number): ProcessingTimeUnit => {
  if (ticks >= 480 && ticks % 480 === 0) return 'days';
  if (ticks >= 60 && ticks % 60 === 0) return 'hours';
  return 'minutes';
};

const convertTicksToProcessingUnit = (ticks: number, unit: ProcessingTimeUnit): number => {
  switch (unit) {
    case 'days':
      return ticks / 480;
    case 'hours':
      return ticks / 60;
    case 'minutes':
      return ticks;
  }
};

const convertProcessingUnitToTicks = (value: number, unit: ProcessingTimeUnit): number => {
  switch (unit) {
    case 'days':
      return Math.round(value * 480);
    case 'hours':
      return Math.round(value * 60);
    case 'minutes':
      return Math.round(value);
  }
};

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
  const capacityMode = useStore((state) => state.capacityMode);
  const sharedCapacityInputMode = useStore((state) => state.sharedCapacityInputMode);
  const sharedCapacityValue = useStore((state) => state.sharedCapacityValue);
  const unitAbbrev = getTimeUnitAbbrev(timeUnit);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [processingTimeUnit, setProcessingTimeUnit] = useState<ProcessingTimeUnit>('minutes');

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
  const processingTimeDisplay = convertTicksToProcessingUnit(data.processingTime, processingTimeUnit);
  const capacityProfile = useMemo(
    () =>
      getNodeCapacityProfile(node as any, nodes as any, {
        capacityMode,
        sharedCapacityInputMode,
        sharedCapacityValue,
      }),
    [capacityMode, node, nodes, sharedCapacityInputMode, sharedCapacityValue],
  );
  const allocationTotals = useMemo(
    () =>
      getSharedAllocationTotals(nodes as any, {
        capacityMode,
        sharedCapacityInputMode,
        sharedCapacityValue,
      }),
    [capacityMode, nodes, sharedCapacityInputMode, sharedCapacityValue],
  );
  const isSharedAllocationNode = capacityProfile.usesSharedAllocation && (isStartNode || isStandardNode);
  const derivedCapacityLimit = Math.max(
    0,
    capacityProfile.usesSharedAllocation ? capacityProfile.maxConcurrentItems : getLocalCapacityUnits(data.resources || 0),
  );
  const allocationUsesEqualSplit = allocationTotals.totalAllocatedPercent <= 0 && allocationTotals.workNodeCount > 0;
  const effectiveAllocatedPercent = allocationUsesEqualSplit ? 100 : allocationTotals.totalAllocatedPercent;
  const effectiveRemainingPercent = allocationUsesEqualSplit ? 0 : allocationTotals.remainingPercent;
  const effectiveAllocatedHoursPerDay = allocationUsesEqualSplit
    ? allocationTotals.totalSharedHoursPerDay
    : allocationTotals.allocatedHoursPerDay;
  const effectiveRemainingHoursPerDay = allocationUsesEqualSplit ? 0 : allocationTotals.remainingHoursPerDay;
  const displayedAllocationPercent = allocationUsesEqualSplit
    ? capacityProfile.allocationPercent
    : clampAllocationPercent(data.allocationPercent || 0);

  // Calculate current routing weights for display
  const currentWeights = data.routingWeights || {};
  const totalWeight = outgoingEdges.reduce((sum, e) => sum + (currentWeights[e.target] ?? 1), 0);

  // Source config (init if undefined)
  const sourceConfig = data.sourceConfig || { enabled: false, interval: 20, batchSize: 1 };
  const flowMode = data.flowMode === 'pull' ? 'pull' : 'push';
  const maxBatchSize = Math.max(1, data.resources || 1);
  const batchSizeRaw = Number(data.batchSize);
  const batchingEnabled = Number.isFinite(batchSizeRaw) && batchSizeRaw > 1;
  const batchSize = Math.min(
    Math.max(batchingEnabled ? Math.round(batchSizeRaw) : (maxBatchSize > 1 ? 2 : 1), maxBatchSize > 1 ? 2 : 1),
    maxBatchSize,
  );
  const canEnableBatching = !isSharedAllocationNode && flowMode !== 'pull' && maxBatchSize > 1;

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

  useEffect(() => {
    setProcessingTimeUnit(getProcessingTimeUnit(data.processingTime));
  }, [data.processingTime, node.id]);

  return (
    <div className="absolute right-3 top-3 bottom-[80px] w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Configuration</h2>
          <p className="text-[11px] text-slate-400">Edit node parameters</p>
        </div>
        <div className="flex gap-0.5">
            <button onClick={handleDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition" title="Delete Node">
                <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition">
                <X size={16} />
            </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        
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
            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-3">
                 <div className="flex items-center gap-2 text-slate-700">
                    <Zap size={14} className="text-emerald-500" />
                    <span className="text-xs font-bold uppercase tracking-wider">Input Configuration</span>
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
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <HelpCircle size={14} className="text-slate-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Working Hours</span>
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
             <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
               {isSharedAllocationNode ? 'Effort per Item' : 'Processing Time'}
             </label>
             <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{data.processingTime} min</span>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <input
              type="number"
              min={isEndNode ? '0' : '1'}
              step={processingTimeUnit === 'minutes' ? '1' : '0.25'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
              value={processingTimeDisplay}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                const min = isEndNode ? 0 : processingTimeUnit === 'minutes' ? 1 : 0.25;
                handleChange('processingTime', Math.max(isEndNode ? 0 : 1, convertProcessingUnitToTicks(Math.max(min, raw), processingTimeUnit)));
              }}
            />
            <select
              value={processingTimeUnit}
              onChange={(e) => setProcessingTimeUnit(e.target.value as ProcessingTimeUnit)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white"
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
          <p className="text-xs text-slate-400">
            {isSharedAllocationNode
              ? 'In shared allocation mode this is effort demand per item. Lower allocation means the same effort takes longer in elapsed time.'
              : 'Supports long-running steps. Enter any duration in minutes, hours, or workdays.'}
          </p>
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
        {!isEndNode && !isSharedAllocationNode && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Capacity (Resources)</label>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{data.resources}</span>
            </div>
            <input
              type="number"
              min="1"
              step="1"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-slate-800"
              value={data.resources}
              onChange={(e) => handleChange('resources', Math.max(1, parseInt(e.target.value || '1', 10)))}
            />
            <p className="text-xs text-slate-400">Number of items that can be processed simultaneously. No hard cap.</p>
          </div>
        )}

        {isSharedAllocationNode && (
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <Zap size={14} className="text-blue-500" />
              <span className="text-xs font-bold uppercase tracking-wider">Shared Allocation</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Allocation</label>
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                  {allocationUsesEqualSplit ? `Auto ${displayedAllocationPercent.toFixed(0)}%` : `${displayedAllocationPercent.toFixed(0)}%`}
                </span>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
                value={data.allocationPercent || 0}
                onChange={(e) => handleChange('allocationPercent', clampAllocationPercent(Number(e.target.value)))}
              />
              <p className="text-xs text-slate-500">
                {allocationUsesEqualSplit
                  ? `This node is currently using the equal-split fallback, so 0% configured behaves like ${displayedAllocationPercent.toFixed(0)}% effective allocation until you assign percentages.`
                  : 'This node draws a percentage of the shared team budget defined in Settings.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Total Budget</div>
                <div className="mt-1 font-semibold text-slate-700">
                  {allocationTotals.totalSharedHoursPerDay.toFixed(1)}h/day
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Allocated %</div>
                <div className="mt-1 font-semibold text-slate-700">{effectiveAllocatedPercent.toFixed(0)}%</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Allocated h/day</div>
                <div className="mt-1 font-semibold text-slate-700">
                  {effectiveAllocatedHoursPerDay.toFixed(1)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Remaining %</div>
                <div className={`mt-1 font-semibold ${effectiveRemainingPercent < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {effectiveRemainingPercent.toFixed(0)}%
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 col-span-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Remaining h/day</div>
                <div className={`mt-1 font-semibold ${effectiveRemainingHoursPerDay < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {effectiveRemainingHoursPerDay.toFixed(1)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Hours/Day</div>
                <div className="mt-1 font-semibold text-slate-700">{capacityProfile.allocatedHoursPerDay.toFixed(1)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400">FTE Eq.</div>
                <div className="mt-1 font-semibold text-slate-700">{capacityProfile.equivalentResources.toFixed(2)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Active Cap</div>
                <div className="mt-1 font-semibold text-slate-700">{derivedCapacityLimit}</div>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Changing total shared capacity rescales the hour budget. The percentage budget only changes when you edit node allocations.
            </p>

            <p className={`text-xs ${allocationTotals.isOverAllocated ? 'text-red-600' : 'text-slate-500'}`}>
              {allocationTotals.isOverAllocated
                ? 'This shared team is over-allocated. The simulator will allow it, but the model is now optimistic relative to available capacity.'
                : 'Remaining budget is informational only. You can still allocate beyond 100% if you want to model over-commitment.'}
            </p>
          </div>
        )}

        {isStandardNode && (
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <Zap size={14} className="text-violet-500" />
              <span className="text-xs font-bold uppercase tracking-wider">Batch Processing</span>
            </div>
            {isSharedAllocationNode ? (
              <p className="text-xs text-slate-500">
                Shared allocation mode disables batching in this version. Switch the simulator back to Local Resources if this step needs true batch starts.
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleChange('batchSize', 0)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      !batchingEnabled
                        ? 'bg-slate-800 border-slate-800 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    disabled={!batchingEnabled && !canEnableBatching}
                    onClick={() => {
                      if (!batchingEnabled && !canEnableBatching) return;
                      handleChange('batchSize', Math.max(2, Math.min(batchSize, maxBatchSize)));
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      batchingEnabled
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50'
                    }`}
                  >
                    On
                  </button>
                </div>

                {batchingEnabled ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Batch Size</span>
                      <span className="font-bold text-violet-700">{batchSize}</span>
                    </div>
                    <input
                      type="number"
                      min="2"
                      max={maxBatchSize}
                      step="1"
                      disabled={flowMode === 'pull' || maxBatchSize < 2}
                      className="w-full px-3 py-2 border border-violet-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      value={batchSize}
                      onChange={(e) => handleChange('batchSize', Math.max(2, parseInt(e.target.value || '2', 10)))}
                    />
                    <p className="text-xs text-slate-500">
                      {flowMode === 'pull'
                        ? 'Pull mode pauses local batching. Switch back to push to batch work at this node.'
                        : 'The node waits for this many queued items before starting them together.'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {maxBatchSize < 2
                      ? 'Increase resources to at least 2 before turning batching on.'
                      : 'Batching is off. Available resources will start work individually as items arrive.'}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {!isEndNode && (
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <Split size={14} className="text-blue-500" />
              <span className="text-xs font-bold uppercase tracking-wider">Flow Control</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleChange('flowMode', 'push')}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                  flowMode === 'push'
                    ? 'bg-slate-800 border-slate-800 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Push
              </button>
              <button
                type="button"
                onClick={() => handleChange('flowMode', 'pull')}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                  flowMode === 'pull'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Pull
              </button>
            </div>

            {flowMode === 'pull' && (
              <div className="rounded-lg border border-blue-200 bg-white/70 px-3 py-2 text-xs text-slate-600">
                This node can hold up to <span className="font-bold text-blue-700">{derivedCapacityLimit}</span> active items, matching its {isSharedAllocationNode ? 'derived shared-allocation cap' : 'resource count'}.
                Extra work stays upstream until a slot opens, so no new local queue forms here. If you switch from push to pull mid-run, any work already queued here will drain first.
              </div>
            )}
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
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-3">
             <div className="flex items-center gap-2 text-slate-700">
                <Split size={14} className="text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider">Routing Logic</span>
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
      <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
          Changes affect future items only. Current items are unaffected.
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
