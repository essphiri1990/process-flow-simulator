import React, { useMemo } from 'react';
import { useStore } from '../store';
import { X, User, Box, FileText, Circle, Square, Clock, Palette, ChevronDown, Activity, RefreshCw } from 'lucide-react';
import { NODE_HEADER_COLORS, DEMAND_UNIT_LABELS, DemandUnit } from '../types';
import {
  getSharedAllocationTotals,
  getWorkNodes,
  WORKDAY_HOURS,
} from '../capacityModel';

interface SettingsModalProps {
  onClose: () => void;
}

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
  const setCapacityMode = useStore((state) => state.setCapacityMode);
  const setSharedCapacityInputMode = useStore((state) => state.setSharedCapacityInputMode);
  const setSharedCapacityValue = useStore((state) => state.setSharedCapacityValue);
  const demandArrivalsGenerated = useStore((state) => state.demandArrivalsGenerated);
  const simulationSeed = useStore((state) => state.simulationSeed);
  const setSimulationSeed = useStore((state) => state.setSimulationSeed);
  const randomizeSimulationSeed = useStore((state) => state.randomizeSimulationSeed);
  const kpiTargets = useStore((state) => state.kpiTargets);
  const setKpiTargets = useStore((state) => state.setKpiTargets);
  const showSunMoonClock = useStore((state) => state.showSunMoonClock);
  const setShowSunMoonClock = useStore((state) => state.setShowSunMoonClock);
  const nodes = useStore((state) => state.nodes);

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
  const allocationTotals = useMemo(
    () =>
      getSharedAllocationTotals(nodes as any, {
        capacityMode,
        sharedCapacityInputMode,
        sharedCapacityValue,
      }),
    [capacityMode, nodes, sharedCapacityInputMode, sharedCapacityValue],
  );
  const allocationUsesEqualSplit = allocationTotals.totalAllocatedPercent <= 0 && getWorkNodes(nodes).length > 0;
  const effectiveAllocatedPercent = allocationUsesEqualSplit ? 100 : allocationTotals.totalAllocatedPercent;
  const effectiveAllocatedHoursPerDay = allocationUsesEqualSplit
    ? allocationTotals.totalSharedHoursPerDay
    : allocationTotals.allocatedHoursPerDay;
  const effectiveRemainingPercent = allocationUsesEqualSplit ? 0 : allocationTotals.remainingPercent;
  const effectiveRemainingHoursPerDay = allocationUsesEqualSplit ? 0 : allocationTotals.remainingHoursPerDay;

  const DEMAND_UNIT_OPTIONS: DemandUnit[] = ['hour', 'day', 'week', 'month'];

  const icons = [
    { id: 'none', label: 'None', icon: <Circle size={16} /> },
    { id: 'user', label: 'Person', icon: <User size={16} /> },
    { id: 'box', label: 'Package', icon: <Box size={16} /> },
    { id: 'file', label: 'Document', icon: <FileText size={16} /> },
  ];

  const shapes = [
    { id: 'circle', label: 'Circle', icon: <Circle size={16} /> },
    { id: 'square', label: 'Square', icon: <Square size={16} /> },
    { id: 'rounded', label: 'Rounded', icon: <Square className="rounded" size={16} /> },
  ];

  const colors = [
    '#d97706', // Amber (Default)
    '#dc2626', // Red
    '#2563eb', // Blue
    '#16a34a', // Green
    '#9333ea', // Purple
    '#db2777', // Pink
    '#475569', // Slate
  ];

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,0.9)]">
        <div className="px-6 py-4 border-b-2 border-slate-900 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Simulation Settings</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-xl border border-slate-200 text-slate-500 transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Section: Context / Appearance */}
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Item Appearance</h3>
            
            <div className="space-y-4">
              
              {/* Icon Selection */}
              <div>
                <label className="text-xs text-slate-400 font-bold mb-2 block">Icon</label>
                <div className="flex gap-2">
                  {icons.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setItemConfig({ icon: item.id as any })}
                      className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition ${
                        itemConfig.icon === item.id 
                          ? 'bg-blue-50 border-blue-500 text-blue-700' 
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {item.icon}
                      <span className="text-[10px] font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Shape Selection */}
              <div>
                <label className="text-xs text-slate-400 font-bold mb-2 block">Shape</label>
                <div className="flex gap-2">
                   {shapes.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setItemConfig({ shape: item.id as any })}
                      className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition ${
                        itemConfig.shape === item.id 
                          ? 'bg-blue-50 border-blue-500 text-blue-700' 
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {item.icon}
                      <span className="text-[10px] font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Selection */}
              <div>
                <label className="text-xs text-slate-400 font-bold mb-2 block">Color</label>
                <div className="flex gap-3">
                   {colors.map((color) => (
                     <button
                       key={color}
                       onClick={() => setItemConfig({ color })}
                       className={`w-8 h-8 rounded-full border-2 shadow-sm transition transform hover:scale-110 ${itemConfig.color === color ? 'border-slate-800 scale-110' : 'border-white'}`}
                       style={{ backgroundColor: color }}
                     />
                   ))}
                </div>
              </div>

            </div>
          </div>

          {/* Preview */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Preview Item</span>
              <div
                  className={`w-10 h-10 shadow-md flex items-center justify-center text-white transition-all`}
                  style={{
                      backgroundColor: itemConfig.color,
                      borderRadius: itemConfig.shape === 'circle' ? '50%' : itemConfig.shape === 'rounded' ? '8px' : '0px'
                  }}
              >
                  {itemConfig.icon === 'user' && <User size={20} />}
                  {itemConfig.icon === 'box' && <Box size={20} />}
                  {itemConfig.icon === 'file' && <FileText size={20} />}
              </div>
          </div>

          {/* Node Header Color */}
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Palette size={14} />
              Node Header Color
            </h3>
            <div>
              <label className="text-xs text-slate-400 font-bold mb-2 block">Default color for all node headers</label>
              <div className="flex flex-wrap gap-2.5">
                {NODE_HEADER_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setDefaultHeaderColor(color)}
                    className={`w-8 h-8 rounded-full border-2 shadow-sm transition transform hover:scale-110 ${defaultHeaderColor === color ? 'border-slate-800 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-white'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: defaultHeaderColor + '40', border: `2px solid ${defaultHeaderColor}60` }} />
                <span className="text-xs text-slate-400">Preview tint applied to node headers</span>
              </div>
            </div>
          </div>

          {/* Time Unit Configuration */}
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Clock size={14} />
              Time Settings
            </h3>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <label className="text-xs text-slate-400 font-bold mb-1 block">Simulation time base</label>
              <p className="text-sm font-semibold text-slate-700">1 tick = 1 simulated minute</p>
              <p className="text-xs text-slate-500 mt-1">
                Run Time = observation window. Working = queue + processing. Elapsed = spawn to completion.
              </p>
            </div>

            <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
              <div>
                <label className="text-xs text-slate-400 font-bold mb-1 block">Sun / moon clock</label>
                <p className="text-xs text-slate-500">Show or hide the day/night progress artwork in the top-right corner.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSunMoonClock(!showSunMoonClock)}
                className={`inline-flex h-7 w-14 items-center rounded-full border transition ${
                  showSunMoonClock
                    ? 'border-blue-500 bg-blue-500 justify-end'
                    : 'border-slate-300 bg-slate-200 justify-start'
                }`}
                aria-pressed={showSunMoonClock}
              >
                <span className="mx-1 h-5 w-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Capacity Model</h3>

            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCapacityMode('local')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    capacityMode === 'local'
                      ? 'bg-slate-800 border-slate-800 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Local Resources
                </button>
                <button
                  type="button"
                  onClick={() => setCapacityMode('sharedAllocation')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    capacityMode === 'sharedAllocation'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Shared Allocation
                </button>
              </div>

              {capacityMode === 'sharedAllocation' ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSharedCapacityInputMode('fte')}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        sharedCapacityInputMode === 'fte'
                          ? 'bg-slate-800 border-slate-800 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      FTE
                    </button>
                    <button
                      type="button"
                      onClick={() => setSharedCapacityInputMode('hours')}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        sharedCapacityInputMode === 'hours'
                          ? 'bg-slate-800 border-slate-800 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      Hours / Day
                    </button>
                  </div>

                  <label className="block">
                    <span className="text-xs text-slate-400 font-bold mb-1 block">
                      {sharedCapacityInputMode === 'fte' ? 'Total effective team capacity' : 'Total shared hours per day'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step={sharedCapacityInputMode === 'fte' ? '0.25' : '1'}
                      value={sharedCapacityValue}
                      onChange={(event) => setSharedCapacityValue(Number(event.target.value))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Budget</div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">{allocationTotals.totalSharedHoursPerDay.toFixed(1)} h/day</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Allocated %</div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">{effectiveAllocatedPercent.toFixed(0)}%</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Allocated h/day</div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">{effectiveAllocatedHoursPerDay.toFixed(1)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Remaining %</div>
                      <div className={`mt-1 text-sm font-semibold ${effectiveRemainingPercent < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {effectiveRemainingPercent.toFixed(0)}%
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Remaining h/day</div>
                      <div className={`mt-1 text-sm font-semibold ${effectiveRemainingHoursPerDay < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {effectiveRemainingHoursPerDay.toFixed(1)}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    {sharedCapacityInputMode === 'fte'
                      ? `1 FTE is treated as ${WORKDAY_HOURS} hours per working day.`
                      : 'Each work node consumes a percentage share of this daily team budget.'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Changing total shared capacity rescales the hour budget. The percentage budget only changes when you edit node allocations.
                  </p>
                  <p className={`text-xs ${allocationTotals.isOverAllocated ? 'text-amber-700' : 'text-slate-500'}`}>
                    {allocationUsesEqualSplit
                      ? 'All work-node allocations are currently 0%, so the simulator will split capacity evenly across start and process nodes until you assign percentages.'
                      : allocationTotals.isOverAllocated
                        ? 'Allocations above 100% are allowed for planning, but they over-commit the shared team and will make the flow optimistic.'
                        : 'Each start/process node can claim a percentage of the shared team budget in its node configuration.'}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Local Resources keeps capacity attached to each node. Use Shared Allocation when the same people divide time across multiple steps.
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Simulation Seed</h3>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-bold mb-1 block">Deterministic seed</label>
                <input
                  type="number"
                  value={simulationSeed}
                  onChange={(event) => setSimulationSeed(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={randomizeSimulationSeed}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <RefreshCw size={14} />
                Randomize Seed
              </button>
              <p className="text-xs text-slate-500">
                Reset and rerun with the same seed to replay the same stochastic outcomes.
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">KPI Targets</h3>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs text-slate-400 font-bold mb-1 block">Lead Time Target</span>
                  <input
                    type="number"
                    min="0"
                    value={kpiTargets.leadTime}
                    onChange={(event) => setKpiTargets({ leadTime: Number(event.target.value) })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">Minutes</span>
                </label>

                <label className="block">
                  <span className="text-xs text-slate-400 font-bold mb-1 block">PCE Target</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={kpiTargets.processEfficiency}
                    onChange={(event) => setKpiTargets({ processEfficiency: Number(event.target.value) })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">%</span>
                </label>

                <label className="block">
                  <span className="text-xs text-slate-400 font-bold mb-1 block">Utilisation Target</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={kpiTargets.resourceUtilization}
                    onChange={(event) => setKpiTargets({ resourceUtilization: Number(event.target.value) })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">%</span>
                </label>
              </div>

              <p className="text-xs text-slate-500">
                The KPI dashboard can compare hourly, daily, weekly, or monthly averages against these targets.
              </p>
            </div>
          </div>

          {/* Demand Settings */}
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity size={14} />
              Demand Settings
            </h3>

            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setDemandMode('auto')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    demandMode === 'auto'
                      ? 'bg-slate-800 border-slate-800 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Auto
                </button>
                <button
                  onClick={() => setDemandMode('target')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    demandMode === 'target'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Target
                </button>
              </div>

              <div className="relative">
                <select
                  value={demandUnit}
                  onChange={(e) => setDemandUnit(e.target.value as DemandUnit)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-slate-700 cursor-pointer hover:border-slate-300 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Demand unit (working hours)"
                >
                  {DEMAND_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>{DEMAND_UNIT_LABELS[unit]}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {demandMode === 'target' && (
                <div className="text-xs text-slate-500">
                  {demandArrivalsGenerated}/{demandTotals} per {DEMAND_UNIT_LABELS[demandUnit]}
                </div>
              )}

              <p className="text-xs text-slate-400">
                Targets are configured on start nodes; arrivals respect each node's working hours.
              </p>
            </div>
          </div>

        </div>

        <div className="p-4 bg-slate-50 border-t-2 border-slate-900 flex justify-end">
            <button onClick={onClose} className="bg-slate-950 text-white px-5 py-2.5 rounded-xl text-sm font-bold border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] hover:bg-slate-800 transition active:translate-y-[1px] active:shadow-none">
                Done
            </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
