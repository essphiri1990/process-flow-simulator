import React, { memo, useMemo } from 'react';
import { useStore } from '../store';
import { X, TrendingUp, Activity, BarChart3, Clock, CheckCircle2, Gauge, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { DURATION_PRESETS, TICKS_PER_HOUR, TICKS_PER_WORKDAY, TICKS_PER_WEEK } from '../types';

interface AnalyticsDashboardProps {
  onClose: () => void;
}

// Get adaptive display config based on duration preset
const getDisplayConfig = (durationPreset: string, tickCount: number): { divisor: number; abbrev: string; unitName: string } => {
  const preset = DURATION_PRESETS[durationPreset];

  if (durationPreset === 'unlimited' || !preset) {
    // Auto-scale based on current elapsed time
    if (tickCount < TICKS_PER_HOUR) return { divisor: 1, abbrev: 'min', unitName: 'minutes' };
    if (tickCount < TICKS_PER_WORKDAY) return { divisor: TICKS_PER_HOUR, abbrev: 'hr', unitName: 'hours' };
    if (tickCount < TICKS_PER_WEEK) return { divisor: TICKS_PER_WORKDAY, abbrev: 'd', unitName: 'days' };
    return { divisor: TICKS_PER_WEEK, abbrev: 'wk', unitName: 'weeks' };
  }

  // Use preset's recommended unit
  switch (preset.displayUnit) {
    case 'hours': return { divisor: TICKS_PER_HOUR, abbrev: 'hr', unitName: 'hours' };
    case 'days': return { divisor: TICKS_PER_WORKDAY, abbrev: 'd', unitName: 'days' };
    case 'weeks': return { divisor: TICKS_PER_WEEK, abbrev: 'wk', unitName: 'weeks' };
    case 'months': return { divisor: TICKS_PER_WORKDAY * 22, abbrev: 'mo', unitName: 'months' };
    default: return { divisor: 1, abbrev: 'min', unitName: 'minutes' };
  }
};

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onClose }) => {
  const history = useStore((state) => state.history);
  const isRunning = useStore((state) => state.isRunning);
  const nodes = useStore((state) => state.nodes);
  const items = useStore((state) => state.items);
  const tickCount = useStore((state) => state.tickCount);
  const durationPreset = useStore((state) => state.durationPreset);
  const targetDuration = useStore((state) => state.targetDuration);
  const simulationProgress = useStore((state) => state.simulationProgress);

  // Get adaptive display configuration
  const displayConfig = useMemo(() => getDisplayConfig(durationPreset, tickCount), [durationPreset, tickCount]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    if (history.length === 0) {
      return { currentWip: 0, totalCompleted: 0, avgThroughput: 0, peakWip: 0, avgWip: 0 };
    }

    const latest = history[history.length - 1];
    const peakWip = Math.max(...history.map(h => h.wip));
    const avgWip = history.reduce((sum, h) => sum + h.wip, 0) / history.length;
    const avgThroughput = history.reduce((sum, h) => sum + h.throughput, 0) / history.length;

    return {
      currentWip: latest.wip,
      totalCompleted: latest.totalCompleted,
      avgThroughput: avgThroughput,
      peakWip,
      avgWip
    };
  }, [history]);

  // Calculate per-node statistics
  const nodeStats = useMemo(() => {
    const processNodes = nodes.filter(n => n.type === 'processNode' || n.type === 'startNode' || n.type === 'endNode');

    return processNodes.map(node => {
      const data = node.data as any;
      const nodeItems = items.filter(item => item.currentNodeId === node.id);
      const queuedCount = nodeItems.filter(item => item.status === 'QUEUED').length;
      const processingCount = nodeItems.filter(item => item.status === 'PROCESSING').length;

      return {
        id: node.id,
        label: data.label || 'Unknown',
        type: node.type,
        processed: data.stats?.processed || 0,
        failed: data.stats?.failed || 0,
        queueLength: queuedCount,
        utilization: data.resources > 0 ? (processingCount / data.resources) * 100 : 0,
        quality: (data.quality || 1) * 100,
        processingTime: data.processingTime || 0,
        resources: data.resources || 1
      };
    }).sort((a, b) => b.processed - a.processed);
  }, [nodes, items]);

  // Format time based on adaptive display config
  const formatTime = (ticks: number) => {
    if (displayConfig.divisor === 1) return ticks.toFixed(0);
    return (ticks / displayConfig.divisor).toFixed(1);
  };

  // If no history, show empty state
  if (history.length < 2) {
    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 text-center border border-slate-200">
          <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Activity size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">No Data Available</h2>
          <p className="text-slate-500 mb-6">Run the simulation for a few seconds to gather analytics data.</p>
          <button onClick={onClose} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full h-[90vh] overflow-hidden border border-slate-200 flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="text-blue-600" />
              Performance Analytics
            </h2>
            <p className="text-xs text-slate-500">
              Real-time simulation metrics • {formatTime(tickCount)} {displayConfig.unitName} elapsed
              {isRunning && <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-bold animate-pulse">● Live</span>}
            </p>
          </div>

          {/* Progress indicator (when duration is set) */}
          {targetDuration !== Infinity && (
            <div className="flex items-center gap-4 mr-4">
              <div className="text-right">
                <div className="text-xs text-slate-500 font-medium">Progress</div>
                <div className="text-sm font-bold text-slate-700">{simulationProgress.toFixed(1)}%</div>
              </div>
              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    simulationProgress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, simulationProgress)}%` }}
                />
              </div>
            </div>
          )}

          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">

          {/* Summary Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Gauge size={14} />
                <span className="text-xs font-bold uppercase">Current WIP</span>
              </div>
              <div className="text-2xl font-bold text-blue-600">{stats.currentWip}</div>
              <div className="text-xs text-slate-400">Peak: {stats.peakWip}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <CheckCircle2 size={14} />
                <span className="text-xs font-bold uppercase">Completed</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600">{stats.totalCompleted}</div>
              <div className="text-xs text-slate-400">Total items finished</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Activity size={14} />
                <span className="text-xs font-bold uppercase">Throughput</span>
              </div>
              <div className="text-2xl font-bold text-purple-600">{stats.avgThroughput.toFixed(1)}</div>
              <div className="text-xs text-slate-400">per 100 {displayConfig.unitName}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock size={14} />
                <span className="text-xs font-bold uppercase">Avg WIP</span>
              </div>
              <div className="text-2xl font-bold text-amber-600">{stats.avgWip.toFixed(1)}</div>
              <div className="text-xs text-slate-400">Items in system</div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Chart 1: WIP Over Time */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                Work In Progress (WIP)
              </h3>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="wipGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="tick"
                      stroke="#94a3b8"
                      tick={{fontSize: 10}}
                      tickFormatter={(v) => formatTime(v)}
                      label={{ value: `Time (${displayConfig.unitName})`, position: 'insideBottom', offset: -5, fontSize: 10 }}
                    />
                    <YAxis stroke="#94a3b8" tick={{fontSize: 10}} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      labelFormatter={(v) => `Time: ${formatTime(Number(v))} ${displayConfig.abbrev}`}
                      formatter={(value: number) => [value, 'WIP']}
                    />
                    <Area type="monotone" dataKey="wip" stroke="#2563eb" strokeWidth={2} fill="url(#wipGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-400 mt-2">Rising WIP indicates a bottleneck forming in the system.</p>
            </div>

            {/* Chart 2: Throughput Rate */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                Throughput Rate
              </h3>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="tick"
                      stroke="#94a3b8"
                      tick={{fontSize: 10}}
                      tickFormatter={(v) => formatTime(v)}
                      label={{ value: `Time (${displayConfig.unitName})`, position: 'insideBottom', offset: -5, fontSize: 10 }}
                    />
                    <YAxis stroke="#94a3b8" tick={{fontSize: 10}} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      labelFormatter={(v) => `Time: ${formatTime(Number(v))} ${displayConfig.abbrev}`}
                      formatter={(value: number) => [value.toFixed(2), `Items/100${displayConfig.abbrev}`]}
                    />
                    <Line type="monotone" dataKey="throughput" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-400 mt-2">Rate of completed items. Higher is better.</p>
            </div>

            {/* Chart 3: Cumulative Completed */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                Cumulative Output
              </h3>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="completedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="tick"
                      stroke="#94a3b8"
                      tick={{fontSize: 10}}
                      tickFormatter={(v) => formatTime(v)}
                      label={{ value: `Time (${displayConfig.unitName})`, position: 'insideBottom', offset: -5, fontSize: 10 }}
                    />
                    <YAxis stroke="#94a3b8" tick={{fontSize: 10}} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      labelFormatter={(v) => `Time: ${formatTime(Number(v))} ${displayConfig.abbrev}`}
                      formatter={(value: number) => [value, 'Total Completed']}
                    />
                    <Area type="monotone" dataKey="totalCompleted" stroke="#8b5cf6" strokeWidth={2} fill="url(#completedGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-400 mt-2">Total items that have completed the process over time. A steeper slope indicates higher productivity.</p>
            </div>
          </div>

          {/* Per-Node Statistics Table */}
          {nodeStats.length > 0 && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-slate-500" />
                Node Performance
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 text-xs font-bold text-slate-500 uppercase">Node</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Processed</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Failed</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Queue</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Utilization</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Quality</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Time/{displayConfig.unitName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodeStats.map((node, idx) => (
                      <tr key={node.id} className={idx % 2 === 0 ? 'bg-slate-50/50' : ''}>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              node.type === 'startNode' ? 'bg-emerald-500' :
                              node.type === 'endNode' ? 'bg-red-500' : 'bg-blue-500'
                            }`}></span>
                            <span className="font-medium text-slate-700">{node.label}</span>
                          </div>
                        </td>
                        <td className="text-right py-2 px-3 font-mono text-slate-600">{node.processed}</td>
                        <td className="text-right py-2 px-3 font-mono">
                          {node.failed > 0 ? (
                            <span className="text-red-500 flex items-center justify-end gap-1">
                              <AlertTriangle size={12} />
                              {node.failed}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="text-right py-2 px-3">
                          <span className={`font-mono ${node.queueLength > 5 ? 'text-amber-600 font-bold' : 'text-slate-600'}`}>
                            {node.queueLength}
                          </span>
                        </td>
                        <td className="text-right py-2 px-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  node.utilization > 80 ? 'bg-red-500' :
                                  node.utilization > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, node.utilization)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-slate-500 w-10 text-right">
                              {node.utilization.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-2 px-3">
                          <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                            node.quality >= 95 ? 'bg-emerald-100 text-emerald-700' :
                            node.quality >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {node.quality.toFixed(0)}%
                          </span>
                        </td>
                        <td className="text-right py-2 px-3 font-mono text-slate-600">
                          {formatTime(node.processingTime)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                High queue lengths and utilization over 80% may indicate bottlenecks.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default memo(AnalyticsDashboard);
