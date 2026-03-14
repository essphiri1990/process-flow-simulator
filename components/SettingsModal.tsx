import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { X, User, Box, FileText, Circle, Square, Clock, Palette, ChevronDown, Activity, RefreshCw, Plus, Trash2, Users, Wrench } from 'lucide-react';
import { NODE_HEADER_COLORS, DEMAND_UNIT_LABELS, DemandUnit } from '../types';
import {
  DEFAULT_RESOURCE_POOL_ID,
  getAssetPools,
  getAllSharedAllocationTotals,
  getResourcePools,
  WORKDAY_HOURS,
} from '../capacityModel';
import {
  RESOURCE_POOL_AVATAR_IDS,
  RESOURCE_POOL_AVATAR_PALETTES,
  RESOURCE_POOL_COLOR_IDS,
  RESOURCE_POOL_COLOR_THEMES,
} from '../resourcePoolVisuals';
import ResourcePoolAvatar from './ResourcePoolAvatar';

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'simulation' | 'capacity';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'capacity', label: 'Capacity' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const itemConfig = useStore((state) => state.itemConfig);
  const setItemConfig = useStore((state) => state.setItemConfig);
  const defaultHeaderColor = useStore((state) => state.defaultHeaderColor);
  const setDefaultHeaderColor = useStore((state) => state.setDefaultHeaderColor);
  const demandMode = useStore((state) => state.demandMode);
  const demandUnit = useStore((state) => state.demandUnit);
  const setDemandMode = useStore((state) => state.setDemandMode);
  const setDemandUnit = useStore((state) => state.setDemandUnit);
  const capacityMode = useStore((state) => state.capacityMode);
  const sharedCapacityInputMode = useStore((state) => state.sharedCapacityInputMode);
  const sharedCapacityValue = useStore((state) => state.sharedCapacityValue);
  const resourcePools = useStore((state) => state.resourcePools);
  const assetPools = useStore((state) => state.assetPools);
  const setCapacityMode = useStore((state) => state.setCapacityMode);
  const addResourcePool = useStore((state) => state.addResourcePool);
  const updateResourcePool = useStore((state) => state.updateResourcePool);
  const deleteResourcePool = useStore((state) => state.deleteResourcePool);
  const addAssetPool = useStore((state) => state.addAssetPool);
  const updateAssetPool = useStore((state) => state.updateAssetPool);
  const deleteAssetPool = useStore((state) => state.deleteAssetPool);
  const demandArrivalsGenerated = useStore((state) => state.demandArrivalsGenerated);
  const simulationSeed = useStore((state) => state.simulationSeed);
  const setSimulationSeed = useStore((state) => state.setSimulationSeed);
  const randomizeSimulationSeed = useStore((state) => state.randomizeSimulationSeed);
  const kpiTargets = useStore((state) => state.kpiTargets);
  const setKpiTargets = useStore((state) => state.setKpiTargets);
  const showSunMoonClock = useStore((state) => state.showSunMoonClock);
  const setShowSunMoonClock = useStore((state) => state.setShowSunMoonClock);
  const nodes = useStore((state) => state.nodes);

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  const demandTotals = useMemo(() => {
    let total = 0;
    for (const node of nodes) {
      if (node.type === 'startNode') {
        const target = (node.data as any).demandTarget || 0;
        if (target > 0) total += target;
      }
    }
    return total;
  }, [nodes]);
  const normalizedResourcePools = useMemo(
    () => getResourcePools({ resourcePools, sharedCapacityInputMode, sharedCapacityValue }),
    [resourcePools, sharedCapacityInputMode, sharedCapacityValue],
  );
  const normalizedAssetPools = useMemo(() => getAssetPools(assetPools), [assetPools]);
  const poolAllocationTotals = useMemo(
    () =>
      getAllSharedAllocationTotals(nodes as any, {
        capacityMode,
        sharedCapacityInputMode,
        sharedCapacityValue,
        resourcePools,
      }),
    [capacityMode, nodes, resourcePools, sharedCapacityInputMode, sharedCapacityValue],
  );
  const poolTotalsById = useMemo(
    () => new Map(poolAllocationTotals.map((totals) => [totals.resourcePoolId, totals])),
    [poolAllocationTotals],
  );
  const assetAssignmentsById = useMemo(
    () =>
      new Map(
        normalizedAssetPools.map((pool) => [
          pool.id,
          nodes.filter(
            (node) =>
              (node.type === 'processNode' || node.type === 'startNode') &&
              (node.data as any).assetPoolId === pool.id,
          ).length,
        ]),
      ),
    [nodes, normalizedAssetPools],
  );
  const [poolNameDrafts, setPoolNameDrafts] = useState<Record<string, string>>({});
  const [editingPoolId, setEditingPoolId] = useState<string | null>(null);
  const [assetPoolNameDrafts, setAssetPoolNameDrafts] = useState<Record<string, string>>({});
  const [editingAssetPoolId, setEditingAssetPoolId] = useState<string | null>(null);

  useEffect(() => {
    setPoolNameDrafts((current) =>
      Object.fromEntries(
        normalizedResourcePools.map((pool) => [
          pool.id,
          editingPoolId === pool.id ? current[pool.id] ?? pool.name : pool.name,
        ]),
      ),
    );
  }, [editingPoolId, normalizedResourcePools]);

  useEffect(() => {
    setAssetPoolNameDrafts((current) =>
      Object.fromEntries(
        normalizedAssetPools.map((pool) => [
          pool.id,
          editingAssetPoolId === pool.id ? current[pool.id] ?? pool.name : pool.name,
        ]),
      ),
    );
  }, [editingAssetPoolId, normalizedAssetPools]);

  const commitPoolName = (poolId: string) => {
    const draft = poolNameDrafts[poolId];
    if (draft === undefined) return;
    setEditingPoolId(null);
    updateResourcePool(poolId, { name: draft });
  };

  const commitAssetPoolName = (poolId: string) => {
    const draft = assetPoolNameDrafts[poolId];
    if (draft === undefined) return;
    setEditingAssetPoolId(null);
    updateAssetPool(poolId, { name: draft });
  };

  const DEMAND_UNIT_OPTIONS: DemandUnit[] = ['hour', 'day', 'week', 'month'];

  const icons = [
    { id: 'none', label: 'None', icon: <Circle size={14} /> },
    { id: 'user', label: 'Person', icon: <User size={14} /> },
    { id: 'box', label: 'Package', icon: <Box size={14} /> },
    { id: 'file', label: 'Document', icon: <FileText size={14} /> },
  ];

  const shapes = [
    { id: 'circle', label: 'Circle', icon: <Circle size={14} /> },
    { id: 'square', label: 'Square', icon: <Square size={14} /> },
    { id: 'rounded', label: 'Rounded', icon: <Square className="rounded" size={14} /> },
  ];

  const colors = [
    '#d97706', '#dc2626', '#2563eb', '#16a34a', '#9333ea', '#db2777', '#475569',
  ];

  // --- Segmented toggle helper ---
  const SegmentedToggle = ({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) => (
    <div className="flex rounded-xl border-2 border-slate-900 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`flex-1 px-3 py-2 text-sm font-bold transition ${
            value === opt.id
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  // --- Section label ---
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 mb-2">{children}</div>
  );

  // --- Input field ---
  const inputClass = 'w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900';

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,0.9)]">

        {/* Header */}
        <div className="px-5 py-3 border-b-2 border-slate-900 flex justify-between items-center bg-slate-50">
          <h2 className="text-base font-black text-slate-900">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg border-2 border-slate-900 text-slate-600 transition active:translate-y-[1px]">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b-2 border-slate-900 bg-slate-50">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] transition ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 border-b-2 border-white -mb-[2px]'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">

          {/* ═══════════ APPEARANCE TAB ═══════════ */}
          {activeTab === 'appearance' && (
            <>
              {/* Item Appearance */}
              <div className="space-y-4">
                <SectionLabel>Item Style</SectionLabel>

                {/* Icon + Shape row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5">Icon</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {icons.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setItemConfig({ icon: item.id as any })}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border-2 text-xs font-bold transition ${
                            itemConfig.icon === item.id
                              ? 'border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,0.85)]'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5">Shape</div>
                    <div className="space-y-1.5">
                      {shapes.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setItemConfig({ shape: item.id as any })}
                          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border-2 text-xs font-bold transition ${
                            itemConfig.shape === item.id
                              ? 'border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,0.85)]'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Color + Preview row */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5">Color</div>
                    <div className="flex gap-2">
                      {colors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setItemConfig({ color })}
                          className={`w-7 h-7 rounded-full border-2 transition hover:scale-110 ${itemConfig.color === color ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-slate-300'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[10px] font-bold text-slate-400">Preview</div>
                    <div
                      className="w-10 h-10 shadow-md flex items-center justify-center text-white border-2 border-slate-900"
                      style={{
                        backgroundColor: itemConfig.color,
                        borderRadius: itemConfig.shape === 'circle' ? '50%' : itemConfig.shape === 'rounded' ? '8px' : '0px',
                      }}
                    >
                      {itemConfig.icon === 'user' && <User size={18} />}
                      {itemConfig.icon === 'box' && <Box size={18} />}
                      {itemConfig.icon === 'file' && <FileText size={18} />}
                    </div>
                  </div>
                </div>
              </div>

              {/* Node Header Color */}
              <div>
                <SectionLabel>Node Header Color</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {NODE_HEADER_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setDefaultHeaderColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition hover:scale-110 ${defaultHeaderColor === color ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-slate-300'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: defaultHeaderColor + '40', border: `2px solid ${defaultHeaderColor}60` }} />
                  <span className="text-[10px] text-slate-400 font-medium">Preview tint applied to headers</span>
                </div>
              </div>

              {/* Sun/Moon Clock */}
              <div className="flex items-center justify-between rounded-xl border-2 border-slate-900 px-3 py-2.5">
                <div>
                  <div className="text-xs font-bold text-slate-700">Sun / moon clock</div>
                  <div className="text-[10px] text-slate-400">Day/night artwork in top-right</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSunMoonClock(!showSunMoonClock)}
                  className={`h-7 w-12 rounded-full border-2 border-slate-900 transition flex items-center ${
                    showSunMoonClock ? 'bg-slate-900 justify-end' : 'bg-slate-200 justify-start'
                  }`}
                  aria-pressed={showSunMoonClock}
                >
                  <span className="mx-0.5 h-5 w-5 rounded-full bg-white border border-slate-300 shadow-sm" />
                </button>
              </div>
            </>
          )}

          {/* ═══════════ SIMULATION TAB ═══════════ */}
          {activeTab === 'simulation' && (
            <>
              {/* Time Base */}
              <div className="rounded-xl border-2 border-slate-900 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={13} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-700">1 tick = 1 simulated minute</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Run Time = observation window. Working = queue + processing. Elapsed = spawn to completion.
                </p>
              </div>

              {/* Demand */}
              <div>
                <SectionLabel>Demand</SectionLabel>
                <div className="space-y-3">
                  <SegmentedToggle
                    options={[{ id: 'auto', label: 'Auto' }, { id: 'target', label: 'Target' }]}
                    value={demandMode}
                    onChange={(id) => setDemandMode(id as any)}
                  />

                  <div className="relative">
                    <select
                      value={demandUnit}
                      onChange={(e) => setDemandUnit(e.target.value as DemandUnit)}
                      className={`${inputClass} appearance-none pr-8 cursor-pointer`}
                      title="Demand unit"
                    >
                      {DEMAND_UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>{DEMAND_UNIT_LABELS[unit]}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>

                  {demandMode === 'target' && (
                    <div className="rounded-xl border-2 border-slate-900 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 font-mono">
                      {demandArrivalsGenerated}/{demandTotals} per {DEMAND_UNIT_LABELS[demandUnit]}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400">
                    Targets are configured on start nodes; arrivals respect working hours.
                  </p>
                </div>
              </div>

              {/* Simulation Seed */}
              <div>
                <SectionLabel>Simulation Seed</SectionLabel>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={simulationSeed}
                    onChange={(event) => setSimulationSeed(Number(event.target.value))}
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={randomizeSimulationSeed}
                    className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-slate-600 hover:bg-slate-50 transition active:translate-y-[1px]"
                    title="Randomize seed"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">Same seed = same stochastic outcomes.</p>
              </div>

              {/* KPI Targets */}
              <div>
                <SectionLabel>KPI Targets</SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="text-[10px] font-bold text-slate-400 mb-1 block">Lead Time</span>
                    <input
                      type="number"
                      min="0"
                      value={kpiTargets.leadTime}
                      onChange={(event) => setKpiTargets({ leadTime: Number(event.target.value) })}
                      className={inputClass}
                    />
                    <span className="mt-0.5 block text-[9px] text-slate-400">minutes</span>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold text-slate-400 mb-1 block">PCE</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={kpiTargets.processEfficiency}
                      onChange={(event) => setKpiTargets({ processEfficiency: Number(event.target.value) })}
                      className={inputClass}
                    />
                    <span className="mt-0.5 block text-[9px] text-slate-400">%</span>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold text-slate-400 mb-1 block">Utilisation</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={kpiTargets.resourceUtilization}
                      onChange={(event) => setKpiTargets({ resourceUtilization: Number(event.target.value) })}
                      className={inputClass}
                    />
                    <span className="mt-0.5 block text-[9px] text-slate-400">%</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* ═══════════ CAPACITY TAB ═══════════ */}
          {activeTab === 'capacity' && (
            <>
              <div>
                <SectionLabel>Capacity Model</SectionLabel>
                <SegmentedToggle
                  options={[
                    { id: 'local', label: 'Local Resources' },
                    { id: 'sharedAllocation', label: 'Shared Allocation' },
                  ]}
                  value={capacityMode}
                  onChange={(id) => setCapacityMode(id as any)}
                />
              </div>

              <div className="space-y-5">
                <div className="space-y-4">
                  <SectionLabel>Teams</SectionLabel>
                  {capacityMode === 'sharedAllocation' ? (
                    <>
                      <div className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-[10px] font-medium text-slate-600">
                        Shared allocation keeps processing time as real step time. Team pools create a daily budget for each node, and nodes still use their own people count as the slot cap.
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-500">Team Pools</div>
                        <button
                          type="button"
                          onClick={addResourcePool}
                          className="inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition active:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(15,23,42,0.85)]"
                        >
                          <Plus size={12} />
                          Add Team
                        </button>
                      </div>

                      {normalizedResourcePools.map((pool) => {
                        const poolTotals = poolTotalsById.get(pool.id);
                        const theme = RESOURCE_POOL_COLOR_THEMES[pool.colorId!];
                        const allocationUsesEqualSplit =
                          (poolTotals?.totalAllocatedPercent ?? 0) <= 0 && (poolTotals?.workNodeCount ?? 0) > 0;
                        const effectiveAllocatedPercent = allocationUsesEqualSplit ? 100 : poolTotals?.totalAllocatedPercent ?? 0;
                        const effectiveRemainingPercent = allocationUsesEqualSplit ? 0 : poolTotals?.remainingPercent ?? 0;
                        const isDefaultPool = pool.id === DEFAULT_RESOURCE_POOL_ID;

                        return (
                          <div
                            key={pool.id}
                            className="rounded-xl border-2 border-slate-900 p-3 space-y-3 shadow-[3px_3px_0px_0px_rgba(15,23,42,0.85)]"
                            style={{ backgroundColor: theme.panel }}
                          >
                            <div className="flex items-center gap-2">
                              <ResourcePoolAvatar avatarId={pool.avatarId!} colorId={pool.colorId} size={36} />
                              <input
                                type="text"
                                value={poolNameDrafts[pool.id] ?? pool.name}
                                onChange={(event) =>
                                  setPoolNameDrafts((current) => ({
                                    ...current,
                                    [pool.id]: event.target.value,
                                  }))
                                }
                                onFocus={() => setEditingPoolId(pool.id)}
                                onBlur={() => commitPoolName(pool.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                  }
                                }}
                                className="flex-1 min-w-0 rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                              />
                              {isDefaultPool ? (
                                <span className="rounded-full border-2 border-slate-900 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-700">
                                  Default
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => deleteResourcePool(pool.id)}
                                  className="rounded-lg border-2 border-slate-900 bg-white p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 transition active:translate-y-[1px]"
                                  title="Delete team pool"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>

                            <div>
                              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 mb-1.5">Icon</div>
                              <div className="flex flex-wrap gap-1.5">
                                {RESOURCE_POOL_AVATAR_IDS.map((avatarId) => (
                                  <button
                                    key={avatarId}
                                    type="button"
                                    onClick={() => updateResourcePool(pool.id, { avatarId })}
                                    className={`rounded-xl border-2 p-0.5 transition ${
                                      pool.avatarId === avatarId
                                        ? 'border-slate-900 bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,0.85)]'
                                        : 'border-transparent hover:-translate-y-0.5'
                                    }`}
                                    title={RESOURCE_POOL_AVATAR_PALETTES[avatarId].label}
                                  >
                                    <ResourcePoolAvatar avatarId={avatarId} colorId={pool.colorId} size={30} />
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 mb-1.5">Colour</div>
                              <div className="flex flex-wrap gap-1.5">
                                {RESOURCE_POOL_COLOR_IDS.map((colorId) => {
                                  const colorTheme = RESOURCE_POOL_COLOR_THEMES[colorId];
                                  return (
                                    <button
                                      key={colorId}
                                      type="button"
                                      onClick={() => updateResourcePool(pool.id, { colorId })}
                                      className={`rounded-full border-2 w-7 h-7 transition hover:scale-110 ${
                                        pool.colorId === colorId
                                          ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-slate-300'
                                          : 'border-slate-900/50'
                                      }`}
                                      style={{ backgroundColor: colorTheme.circle }}
                                      title={colorTheme.label}
                                    />
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <SegmentedToggle
                                options={[{ id: 'fte', label: 'FTE' }, { id: 'hours', label: 'Hours / Day' }]}
                                value={pool.inputMode}
                                onChange={(id) => updateResourcePool(pool.id, { inputMode: id as any })}
                              />
                              <input
                                type="number"
                                min="0"
                                step={pool.inputMode === 'fte' ? '0.25' : '1'}
                                value={pool.capacityValue}
                                onChange={(event) => updateResourcePool(pool.id, { capacityValue: Number(event.target.value) })}
                                className="w-full rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                              />
                              {pool.inputMode === 'fte' && (
                                <p className="text-[10px] text-slate-500">1 FTE = {WORKDAY_HOURS}h/day</p>
                              )}
                            </div>

                            <div className="grid grid-cols-4 gap-1.5">
                              <div className="rounded-lg border-2 border-slate-900 bg-white px-2 py-1.5 text-center">
                                <div className="text-[8px] font-bold uppercase text-slate-400">Budget</div>
                                <div className="text-xs font-black text-slate-700 font-mono">{(poolTotals?.totalSharedHoursPerDay ?? 0).toFixed(1)}h</div>
                              </div>
                              <div className="rounded-lg border-2 border-slate-900 bg-white px-2 py-1.5 text-center">
                                <div className="text-[8px] font-bold uppercase text-slate-400">Nodes</div>
                                <div className="text-xs font-black text-slate-700 font-mono">{poolTotals?.workNodeCount ?? 0}</div>
                              </div>
                              <div className="rounded-lg border-2 border-slate-900 bg-white px-2 py-1.5 text-center">
                                <div className="text-[8px] font-bold uppercase text-slate-400">Alloc</div>
                                <div className="text-xs font-black text-slate-700 font-mono">{effectiveAllocatedPercent.toFixed(0)}%</div>
                              </div>
                              <div className="rounded-lg border-2 border-slate-900 bg-white px-2 py-1.5 text-center">
                                <div className="text-[8px] font-bold uppercase text-slate-400">Free</div>
                                <div className={`text-xs font-black font-mono ${effectiveRemainingPercent < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                  {effectiveRemainingPercent.toFixed(0)}%
                                </div>
                              </div>
                            </div>

                            {allocationUsesEqualSplit && (
                              <p className="text-[10px] font-medium text-amber-700">
                                All allocations are 0% — pool will be split evenly across nodes.
                              </p>
                            )}
                            {poolTotals?.isOverAllocated && !allocationUsesEqualSplit && (
                              <p className="text-[10px] font-medium text-red-600">
                                Over-allocated — this pool is over-committed.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        Each node manages its own people count. Switch to Shared Allocation when teams split time across multiple steps.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <SectionLabel>Equipment</SectionLabel>
                  <div className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-[10px] font-medium text-slate-600">
                    Equipment pools are optional shared stations or assets. They are simple slot counts, not hours or FTE.
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-500">Equipment Pools</div>
                    <button
                      type="button"
                      onClick={addAssetPool}
                      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition active:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(15,23,42,0.85)]"
                    >
                      <Plus size={12} />
                      Add Equipment
                    </button>
                  </div>

                  {normalizedAssetPools.length === 0 ? (
                    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      No equipment pools yet. Leave nodes unassigned if they do not need a station or asset.
                    </div>
                  ) : (
                    normalizedAssetPools.map((pool) => (
                      <div
                        key={pool.id}
                        className="rounded-xl border-2 border-slate-900 bg-amber-50 p-3 space-y-3 shadow-[3px_3px_0px_0px_rgba(15,23,42,0.85)]"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-900 bg-white text-amber-700">
                            <Wrench size={16} />
                          </div>
                          <input
                            type="text"
                            value={assetPoolNameDrafts[pool.id] ?? pool.name}
                            onChange={(event) =>
                              setAssetPoolNameDrafts((current) => ({
                                ...current,
                                [pool.id]: event.target.value,
                              }))
                            }
                            onFocus={() => setEditingAssetPoolId(pool.id)}
                            onBlur={() => commitAssetPoolName(pool.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                            }}
                            className="flex-1 min-w-0 rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => deleteAssetPool(pool.id)}
                            className="rounded-lg border-2 border-slate-900 bg-white p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 transition active:translate-y-[1px]"
                            title="Delete equipment pool"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 mb-1.5">Units</div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={pool.units}
                            onChange={(event) => updateAssetPool(pool.id, { units: Number(event.target.value) })}
                            className="w-full rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded-lg border-2 border-slate-900 bg-white px-2 py-1.5 text-center">
                            <div className="text-[8px] font-bold uppercase text-slate-400">Units</div>
                            <div className="text-xs font-black text-slate-700 font-mono">{pool.units}</div>
                          </div>
                          <div className="rounded-lg border-2 border-slate-900 bg-white px-2 py-1.5 text-center">
                            <div className="text-[8px] font-bold uppercase text-slate-400">Nodes</div>
                            <div className="text-xs font-black text-slate-700 font-mono">{assetAssignmentsById.get(pool.id) || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t-2 border-slate-900 flex justify-end">
          <button onClick={onClose} className="bg-slate-950 text-white px-5 py-2 rounded-xl text-sm font-black border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] hover:bg-slate-800 transition active:translate-y-[1px] active:shadow-none">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
