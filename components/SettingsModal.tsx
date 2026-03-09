import React, { useMemo } from 'react';
import { useStore } from '../store';
import { X, User, Box, FileText, Circle, Square, Clock, Palette, ChevronDown, Activity, RefreshCw } from 'lucide-react';
import { NODE_HEADER_COLORS, DEMAND_UNIT_LABELS, DemandUnit } from '../types';

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
  const demandArrivalsGenerated = useStore((state) => state.demandArrivalsGenerated);
  const simulationSeed = useStore((state) => state.simulationSeed);
  const setSimulationSeed = useStore((state) => state.setSimulationSeed);
  const randomizeSimulationSeed = useStore((state) => state.randomizeSimulationSeed);
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Simulation Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500">
            <X size={20} />
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

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button onClick={onClose} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-900 transition">
                Done
            </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
