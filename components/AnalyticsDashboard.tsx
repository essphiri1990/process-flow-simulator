import React from 'react';
import { useStore } from '../store';
import { X, TrendingUp, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AnalyticsDashboardProps {
  onClose: () => void;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onClose }) => {
  const history = useStore((state) => state.history);
  const isRunning = useStore((state) => state.isRunning);

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
                 <button onClick={onClose} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700">Close</button>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[80vh] overflow-hidden border border-slate-200 flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="text-blue-600" />
                Performance Analytics
              </h2>
              <p className="text-xs text-slate-500">
                 Real-time simulation metrics over time
                 {isRunning && <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-bold animate-pulse">● Live</span>}
              </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500">
            <X size={20} />
          </button>
        </div>

        {/* Charts Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50">
           
           {/* Chart 1: WIP Over Time */}
           <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
               <h3 className="text-sm font-bold text-slate-700 mb-4">Work In Progress (WIP)</h3>
               <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                        <YAxis stroke="#94a3b8" tick={{fontSize: 10}} />
                        <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ color: '#64748b', fontSize: '10px' }}
                        />
                        <Line type="monotone" dataKey="wip" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
               </div>
               <p className="text-xs text-slate-400 mt-2">Shows the accumulation of items in the system (Bottleneck indicator).</p>
           </div>

           {/* Chart 2: Throughput Rate */}
           <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
               <h3 className="text-sm font-bold text-slate-700 mb-4">Throughput (Items per 100 Ticks)</h3>
               <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                        <YAxis stroke="#94a3b8" tick={{fontSize: 10}} />
                        <Tooltip 
                             contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                             labelStyle={{ color: '#64748b', fontSize: '10px' }}
                        />
                        <Line type="monotone" dataKey="throughput" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
               </div>
               <p className="text-xs text-slate-400 mt-2">Rate of completed items over time.</p>
           </div>

        </div>

      </div>
    </div>
  );
};

export default AnalyticsDashboard;