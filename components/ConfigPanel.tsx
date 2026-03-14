import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { X, HelpCircle, Split, Zap, Trash2, RotateCcw, ChevronDown, Wrench } from 'lucide-react';
import {
  getTimeUnitAbbrev,
  ProcessNodeData,
  NODE_HEADER_COLORS,
  DEMAND_UNIT_LABELS,
  DEFAULT_WORKING_HOURS,
  WorkingHoursConfig,
} from '../types';
import {
  getAssetPoolById,
  getAssetPools,
  clampAllocationPercent,
  getEffectiveNodeCapacityLimit,
  getEstimatedItemsPerDay,
  getNodeCapacityProfile,
  getNodePeopleCapacityLimit,
  getNodeSharedBudgetSummary,
  getResourcePools,
  getSharedAllocationTotals,
} from '../capacityModel';
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
    case 'days': return ticks / 480;
    case 'hours': return ticks / 60;
    case 'minutes': return ticks;
  }
};

const convertProcessingUnitToTicks = (value: number, unit: ProcessingTimeUnit): number => {
  switch (unit) {
    case 'days': return Math.round(value * 480);
    case 'hours': return Math.round(value * 60);
    case 'minutes': return Math.round(value);
  }
};

// --- Shared UI components ---
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 mb-2">{children}</div>
);

const SegmentedToggle = ({ options, value, onChange, disabled }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void; disabled?: boolean }) => (
  <div className="flex rounded-xl border-2 border-slate-900 overflow-hidden">
    {options.map((opt) => (
      <button
        key={opt.id}
        type="button"
        disabled={disabled}
        onClick={() => onChange(opt.id)}
        className={`flex-1 px-3 py-1.5 text-xs font-bold transition ${
          value === opt.id
            ? 'bg-slate-900 text-white'
            : 'bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const inputClass = 'w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900';
const sliderClass = 'w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900 disabled:opacity-50';

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
  const resourcePools = useStore((state) => state.resourcePools);
  const assetPools = useStore((state) => state.assetPools);
  const sharedNodeBudgetStateByNode = useStore((state) => state.sharedNodeBudgetStateByNode);
  const unitAbbrev = getTimeUnitAbbrev(timeUnit);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [processingTimeUnit, setProcessingTimeUnit] = useState<ProcessingTimeUnit>('minutes');

  if (!node) return null;

  const handleDelete = () => { setShowDeleteConfirm(true); };
  const handleChange = (key: string, value: any) => { updateNodeData(node.id, { [key]: value }); };

  const outgoingEdges = edges.filter(e => e.source === node.id);
  const isStartNode = node.type === 'startNode';
  const isEndNode = node.type === 'endNode';
  const isStandardNode = node.type === 'processNode';

  const data = node.data as ProcessNodeData;
  const workingHours = data.workingHours
    ? { ...DEFAULT_WORKING_HOURS, ...data.workingHours }
    : { ...DEFAULT_WORKING_HOURS };
  const processingTimeDisplay = convertTicksToProcessingUnit(data.processingTime, processingTimeUnit);
  const capacityProfile = useMemo(
    () => getNodeCapacityProfile(node as any, nodes as any, { capacityMode, sharedCapacityInputMode, sharedCapacityValue, resourcePools }),
    [capacityMode, node, nodes, resourcePools, sharedCapacityInputMode, sharedCapacityValue],
  );
  const normalizedResourcePools = useMemo(
    () => getResourcePools({ resourcePools, sharedCapacityInputMode, sharedCapacityValue }),
    [resourcePools, sharedCapacityInputMode, sharedCapacityValue],
  );
  const normalizedAssetPools = useMemo(() => getAssetPools(assetPools), [assetPools]);
  const selectedResourcePoolId = capacityProfile.resourcePoolId || normalizedResourcePools[0]?.id || '';
  const selectedResourcePool = normalizedResourcePools.find((pool) => pool.id === selectedResourcePoolId) || normalizedResourcePools[0];
  const selectedAssetPool = getAssetPoolById(assetPools, data.assetPoolId);
  const peopleCapacityLimit = getNodePeopleCapacityLimit(data, capacityProfile);
  const allocationTotals = useMemo(
    () => getSharedAllocationTotals(nodes as any, { capacityMode, sharedCapacityInputMode, sharedCapacityValue, resourcePools }, selectedResourcePoolId),
    [capacityMode, nodes, resourcePools, selectedResourcePoolId, sharedCapacityInputMode, sharedCapacityValue],
  );
  const isSharedAllocationNode = capacityProfile.usesSharedAllocation && (isStartNode || isStandardNode);
  const derivedCapacityLimit = Math.max(0, getEffectiveNodeCapacityLimit(data, capacityProfile, assetPools));
  const sharedBudgetSummary = useMemo(
    () => getNodeSharedBudgetSummary(node.id, capacityProfile, sharedNodeBudgetStateByNode),
    [capacityProfile, node.id, sharedNodeBudgetStateByNode],
  );
  const estimatedItemsPerDay = useMemo(
    () => getEstimatedItemsPerDay(capacityProfile, data.processingTime),
    [capacityProfile, data.processingTime],
  );
  const allocationUsesEqualSplit = allocationTotals.totalAllocatedPercent <= 0 && allocationTotals.workNodeCount > 0;
  const effectiveAllocatedPercent = allocationUsesEqualSplit ? 100 : allocationTotals.totalAllocatedPercent;
  const effectiveRemainingPercent = allocationUsesEqualSplit ? 0 : allocationTotals.remainingPercent;
  const displayedAllocationPercent = allocationUsesEqualSplit
    ? capacityProfile.allocationPercent
    : clampAllocationPercent(data.allocationPercent || 0);

  const currentWeights = data.routingWeights || {};
  const totalWeight = outgoingEdges.reduce((sum, e) => sum + (currentWeights[e.target] ?? 1), 0);

  const sourceConfig = data.sourceConfig || { enabled: false, interval: 20, batchSize: 1 };
  const flowMode = data.flowMode === 'pull' ? 'pull' : 'push';
  const maxBatchSize = Math.max(1, derivedCapacityLimit || 1);
  const batchSizeRaw = Number(data.batchSize);
  const batchingEnabled = Number.isFinite(batchSizeRaw) && batchSizeRaw > 1;
  const batchSize = Math.min(
    Math.max(batchingEnabled ? Math.round(batchSizeRaw) : (maxBatchSize > 1 ? 2 : 1), maxBatchSize > 1 ? 2 : 1),
    maxBatchSize,
  );
  const canEnableBatching = !isSharedAllocationNode && flowMode !== 'pull' && maxBatchSize > 1;

  const handleWeightChange = (targetId: string, value: number) => {
    updateNodeData(node.id, { routingWeights: { ...currentWeights, [targetId]: value } });
  };
  const handleSourceChange = (key: string, value: any) => {
    updateNodeData(node.id, { sourceConfig: { ...sourceConfig, [key]: value } });
  };
  const updateWorkingHours = (patch: Partial<WorkingHoursConfig>) => {
    updateNodeData(node.id, { workingHours: { ...workingHours, ...patch } });
  };

  useEffect(() => {
    setProcessingTimeUnit(getProcessingTimeUnit(data.processingTime));
  }, [data.processingTime, node.id]);

  return (
    <div className="absolute right-3 top-3 bottom-[80px] w-80 bg-white rounded-2xl border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,0.9)] z-40 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b-2 border-slate-900 flex justify-between items-center bg-slate-50">
        <div>
          <h2 className="text-sm font-black text-slate-900">Configure</h2>
          <p className="text-[10px] text-slate-400 font-medium">Edit node parameters</p>
        </div>
        <div className="flex gap-1">
          <button onClick={handleDelete} className="p-1.5 rounded-lg border-2 border-slate-900 text-slate-400 hover:bg-red-50 hover:text-red-500 transition active:translate-y-[1px]" title="Delete Node">
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg border-2 border-slate-900 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition active:translate-y-[1px]">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Label */}
        <div>
          <SectionLabel>Node Name</SectionLabel>
          <input
            type="text"
            className={inputClass}
            value={node.data.label}
            onChange={(e) => handleChange('label', e.target.value)}
          />
        </div>

        {/* Header Color */}
        <div>
          <SectionLabel>Header Color</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => handleChange('headerColor', undefined)}
              className={`w-6 h-6 rounded-full border-2 transition hover:scale-110 flex items-center justify-center ${!data.headerColor ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-slate-300 border-dashed'}`}
              style={{ backgroundColor: defaultHeaderColor + '30' }}
              title="Use global default"
            >
              <RotateCcw size={8} className="text-slate-500" />
            </button>
            {NODE_HEADER_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleChange('headerColor', color)}
                className={`w-6 h-6 rounded-full border-2 transition hover:scale-110 ${data.headerColor === color ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-slate-300'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Source Configuration */}
        {(isStartNode || (isStandardNode && !edges.some(e => e.target === node.id))) && (
          <div className="rounded-xl border-2 border-slate-900 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-700">Input Source</span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sourceConfig.enabled}
                onChange={(e) => handleSourceChange('enabled', e.target.checked)}
                disabled={demandMode === 'target'}
                className="w-4 h-4 rounded border-2 border-slate-900 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
              />
              <span className="text-xs font-bold text-slate-700">Generate Items</span>
            </label>

            {sourceConfig.enabled && (
              <>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span className="text-slate-500">Interval</span>
                    <span className="text-emerald-700 font-mono">{sourceConfig.interval} {unitAbbrev}</span>
                  </div>
                  <input type="range" min="1" max="100" disabled={demandMode === 'target'} className={sliderClass} value={sourceConfig.interval} onChange={(e) => handleSourceChange('interval', parseInt(e.target.value))} />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span className="text-slate-500">Batch Size</span>
                    <span className="text-emerald-700 font-mono">{sourceConfig.batchSize}</span>
                  </div>
                  <input type="range" min="1" max="10" disabled={demandMode === 'target'} className={sliderClass} value={sourceConfig.batchSize} onChange={(e) => handleSourceChange('batchSize', parseInt(e.target.value))} />
                </div>
              </>
            )}

            {isStartNode && (
              <div className="border-t-2 border-slate-200 pt-2 space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-500">Demand Target</span>
                  <span className="text-emerald-700 font-mono">{data.demandTarget || 0} / {DEMAND_UNIT_LABELS[demandUnit]}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={data.demandTarget || 0}
                  onChange={(e) => handleChange('demandTarget', Math.max(0, parseInt(e.target.value || '0')))}
                />
                <p className="text-[10px] text-slate-400">Used when demand mode is Target.</p>
              </div>
            )}
          </div>
        )}

        {/* Working Hours */}
        {(isStartNode || isStandardNode || isEndNode) && (
          <div className="rounded-xl border-2 border-slate-900 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <HelpCircle size={12} className="text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-700">Working Hours</span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={workingHours.enabled}
                onChange={(e) => updateWorkingHours({ enabled: e.target.checked })}
                className="w-4 h-4 rounded border-2 border-slate-900 text-slate-700 focus:ring-slate-400"
              />
              <span className="text-xs font-bold text-slate-700">Apply working hours</span>
            </label>

            {workingHours.enabled && (
              <>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span className="text-slate-500">Hours / workday</span>
                    <span className="text-slate-700 font-mono">{workingHours.hoursPerDay}h</span>
                  </div>
                  <input type="range" min="0" max="8" step="1" className={sliderClass} value={workingHours.hoursPerDay} onChange={(e) => updateWorkingHours({ hoursPerDay: parseInt(e.target.value, 10) })} />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span className="text-slate-500">Days / week</span>
                    <span className="text-slate-700 font-mono">{workingHours.daysPerWeek}/5</span>
                  </div>
                  <input type="range" min="0" max="5" step="1" className={sliderClass} value={workingHours.daysPerWeek} onChange={(e) => updateWorkingHours({ daysPerWeek: parseInt(e.target.value, 10) })} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Processing Time */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <SectionLabel>{isSharedAllocationNode ? 'Effort per Item' : 'Processing Time'}</SectionLabel>
            <span className="text-[10px] font-bold text-slate-400 font-mono">{data.processingTime}m</span>
          </div>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <input
              type="number"
              min={isEndNode ? '0' : '1'}
              step={processingTimeUnit === 'minutes' ? '1' : '0.25'}
              className={inputClass}
              value={processingTimeDisplay}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                const min = isEndNode ? 0 : processingTimeUnit === 'minutes' ? 1 : 0.25;
                handleChange('processingTime', Math.max(isEndNode ? 0 : 1, convertProcessingUnitToTicks(Math.max(min, raw), processingTimeUnit)));
              }}
            />
            <div className="relative">
              <select
                value={processingTimeUnit}
                onChange={(e) => setProcessingTimeUnit(e.target.value as ProcessingTimeUnit)}
                className={`${inputClass} appearance-none pr-7 cursor-pointer`}
              >
                <option value="minutes">Min</option>
                <option value="hours">Hrs</option>
                <option value="days">Days</option>
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Variability */}
        {!isEndNode && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <SectionLabel>Variability</SectionLabel>
              <span className="text-[10px] font-bold text-slate-400 font-mono">{Math.round((data.variability || 0) * 100)}%</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" className={sliderClass} value={data.variability || 0} onChange={(e) => handleChange('variability', parseFloat(e.target.value))} />
            <p className="mt-1 text-[10px] text-slate-400">0% = fixed, 50% = +/- half the base time.</p>
          </div>
        )}

        {/* Resources (local mode) */}
        {!isEndNode && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <SectionLabel>{isSharedAllocationNode ? 'People Capacity' : 'People / Staff'}</SectionLabel>
              <span className="text-[10px] font-bold text-slate-400 font-mono">{data.resources}</span>
            </div>
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              value={data.resources}
              onChange={(e) => handleChange('resources', Math.max(0, parseInt(e.target.value || '0', 10)))}
            />
            <p className="mt-1 text-[10px] text-slate-500">
              {isSharedAllocationNode
                ? 'Sets the people-side active-slot cap. Shared allocation still controls the daily team budget.'
                : 'Sets the people/staff limit for this step.'}
            </p>
            {selectedAssetPool && (
              <p className="mt-1 text-[10px] text-slate-500">
                Equipment on this node lowers the effective active cap to {derivedCapacityLimit}.
              </p>
            )}
          </div>
        )}

        {/* Stations / Assets */}
        {!isEndNode && (
          <div className="rounded-xl border-2 border-slate-900 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Wrench size={12} className="text-amber-600" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-700">Stations / Assets</span>
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-400 mb-1">Equipment Pool</div>
              <div className="relative">
                <select
                  className={`${inputClass} appearance-none pr-7 cursor-pointer`}
                  value={selectedAssetPool?.id || ''}
                  onChange={(e) => handleChange('assetPoolId', e.target.value || undefined)}
                >
                  <option value="">None</option>
                  {normalizedAssetPools.map((pool) => (
                    <option key={pool.id} value={pool.id}>{pool.name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Leave blank if this step does not need a station or asset.
              </p>
            </div>

            {selectedAssetPool ? (
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                  <div className="text-[8px] font-bold uppercase text-slate-400">People</div>
                  <div className="text-[11px] font-black text-slate-700 font-mono">{peopleCapacityLimit}</div>
                </div>
                <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                  <div className="text-[8px] font-bold uppercase text-slate-400">Equipment</div>
                  <div className="text-[11px] font-black text-slate-700 font-mono">{selectedAssetPool.units}</div>
                </div>
                <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                  <div className="text-[8px] font-bold uppercase text-slate-400">Effective</div>
                  <div className="text-[11px] font-black text-slate-700 font-mono">{derivedCapacityLimit}</div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Shared Allocation */}
        {isSharedAllocationNode && (
          <div className="rounded-xl border-2 border-slate-900 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-700">Shared Allocation</span>
            </div>
            <p className="text-[10px] text-slate-500">
              Processing time stays true elapsed time. Allocation reserves daily budget and limits how many items can start each day.
            </p>

            {/* Pool selector */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 mb-1">Resource Pool</div>
              <div className="relative">
                <select
                  className={`${inputClass} appearance-none pr-7 cursor-pointer`}
                  value={selectedResourcePoolId}
                  onChange={(e) => handleChange('resourcePoolId', e.target.value)}
                >
                  {normalizedResourcePools.map((pool) => (
                    <option key={pool.id} value={pool.id}>{pool.name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Allocation */}
            <div>
              <div className="flex justify-between text-[10px] font-bold mb-1">
                <span className="text-slate-400">Allocation</span>
                <span className="text-slate-600 font-mono">
                  {allocationUsesEqualSplit ? `Auto ${displayedAllocationPercent.toFixed(0)}%` : `${displayedAllocationPercent.toFixed(0)}%`}
                </span>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                className={inputClass}
                value={data.allocationPercent || 0}
                onChange={(e) => handleChange('allocationPercent', clampAllocationPercent(Number(e.target.value)))}
              />
              {allocationUsesEqualSplit && (
                <p className="mt-1 text-[10px] text-amber-600">Equal-split active — set % to override.</p>
              )}
            </div>

            {/* Condensed stats */}
            <div className="grid grid-cols-4 gap-1.5">
              <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                <div className="text-[8px] font-bold uppercase text-slate-400">Pool</div>
                <div className="text-[11px] font-black text-slate-700 font-mono">{allocationTotals.totalSharedHoursPerDay.toFixed(1)}h</div>
              </div>
              <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                <div className="text-[8px] font-bold uppercase text-slate-400">Alloc</div>
                <div className="text-[11px] font-black text-slate-700 font-mono">{effectiveAllocatedPercent.toFixed(0)}%</div>
              </div>
              <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                <div className="text-[8px] font-bold uppercase text-slate-400">Free</div>
                <div className={`text-[11px] font-black font-mono ${effectiveRemainingPercent < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {effectiveRemainingPercent.toFixed(0)}%
                </div>
              </div>
              <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                <div className="text-[8px] font-bold uppercase text-slate-400">Cap</div>
                <div className="text-[11px] font-black text-slate-700 font-mono">{derivedCapacityLimit}</div>
              </div>
            </div>

            {/* Node-level stats */}
            <div className="grid grid-cols-4 gap-1.5">
              <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                <div className="text-[8px] font-bold uppercase text-slate-400">Node</div>
                <div className="text-[11px] font-black text-slate-700 font-mono">{capacityProfile.allocatedHoursPerDay.toFixed(1)}h/d</div>
              </div>
              <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                <div className="text-[8px] font-bold uppercase text-slate-400">Left</div>
                <div className="text-[11px] font-black text-slate-700 font-mono">{(sharedBudgetSummary.remainingBudgetMinutes / 60).toFixed(1)}h</div>
              </div>
              <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                <div className="text-[8px] font-bold uppercase text-slate-400">Items/Day</div>
                <div className="text-[11px] font-black text-slate-700 font-mono">
                  {data.processingTime > 0 ? estimatedItemsPerDay.toFixed(1) : 'Instant'}
                </div>
              </div>
              <div className="rounded-lg border-2 border-slate-900 bg-white px-1.5 py-1 text-center">
                <div className="text-[8px] font-bold uppercase text-slate-400">FTE Eq.</div>
                <div className="text-[11px] font-black text-slate-700 font-mono">{capacityProfile.equivalentResources.toFixed(2)}</div>
              </div>
            </div>

            {allocationTotals.isOverAllocated && (
              <p className="text-[10px] font-medium text-red-600">Pool is over-allocated.</p>
            )}
          </div>
        )}

        {/* Batch Processing */}
        {isStandardNode && (
          <div className="rounded-xl border-2 border-slate-900 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-violet-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-700">Batch Processing</span>
            </div>
            {isSharedAllocationNode ? (
              <p className="text-[10px] text-slate-400">Disabled in shared allocation mode.</p>
            ) : (
              <>
                <SegmentedToggle
                  options={[{ id: 'off', label: 'Off' }, { id: 'on', label: 'On' }]}
                  value={batchingEnabled ? 'on' : 'off'}
                  disabled={!batchingEnabled && !canEnableBatching}
                  onChange={(id) => {
                    if (id === 'off') handleChange('batchSize', 0);
                    else handleChange('batchSize', Math.max(2, Math.min(batchSize, maxBatchSize)));
                  }}
                />
                {batchingEnabled && (
                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className="text-slate-500">Batch Size</span>
                      <span className="text-violet-700 font-mono">{batchSize}</span>
                    </div>
                    <input
                      type="number"
                      min="2"
                      max={maxBatchSize}
                      step="1"
                      disabled={flowMode === 'pull' || maxBatchSize < 2}
                      className={inputClass}
                      value={batchSize}
                      onChange={(e) => handleChange('batchSize', Math.max(2, parseInt(e.target.value || '2', 10)))}
                    />
                  </div>
                )}
                {!batchingEnabled && maxBatchSize < 2 && (
                  <p className="text-[10px] text-slate-400">Need 2+ resources to enable.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Flow Control */}
        {!isEndNode && (
          <div className="rounded-xl border-2 border-slate-900 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Split size={12} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-700">Flow Control</span>
            </div>

            <SegmentedToggle
              options={[{ id: 'push', label: 'Push' }, { id: 'pull', label: 'Pull' }]}
              value={flowMode}
              onChange={(id) => handleChange('flowMode', id)}
            />

            {flowMode === 'pull' && (
              <div className="rounded-lg border-2 border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[10px] text-blue-700 font-medium">
                Max <span className="font-black font-mono">{derivedCapacityLimit}</span> active items. Extra work stays upstream.
              </div>
            )}
          </div>
        )}

        {/* Quality */}
        {!isEndNode && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <SectionLabel>Quality (Pass Rate)</SectionLabel>
              <span className="text-[10px] font-bold text-slate-400 font-mono">{Math.round(data.quality * 100)}%</span>
            </div>
            <input type="range" min="0" max="1" step="0.01" className={sliderClass} value={data.quality} onChange={(e) => handleChange('quality', parseFloat(e.target.value))} />
          </div>
        )}

        {/* Routing */}
        {!isEndNode && outgoingEdges.length > 1 && (
          <div className="rounded-xl border-2 border-slate-900 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Split size={12} className="text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-700">Routing</span>
            </div>
            <div className="space-y-2">
              {outgoingEdges.map(edge => {
                const targetNode = nodes.find(n => n.id === edge.target);
                const weight = currentWeights[edge.target] ?? 1;
                const percentage = Math.round((weight / totalWeight) * 100);
                return (
                  <div key={edge.target}>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className="text-slate-600 truncate max-w-[140px]">{targetNode?.data.label || 'Unknown'}</span>
                      <span className="text-blue-600 font-mono">{percentage}%</span>
                    </div>
                    <input type="range" min="0" max="10" step="1" value={weight} onChange={(e) => handleWeightChange(edge.target, parseInt(e.target.value))} className={sliderClass} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t-2 border-slate-900 bg-slate-50 text-[10px] text-slate-400 font-medium">
        Changes affect future items only.
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Node"
          message={`Delete "${node.data.label}"? This will also remove all connected edges and items at this node.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => { deleteNode(node.id); setShowDeleteConfirm(false); onClose(); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
};

export default ConfigPanel;
