import React from 'react';
import { useStore } from '../store';
import { X, User, Box, FileText, Circle, Square, MousePointer2 } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const itemConfig = useStore((state) => state.itemConfig);
  const setItemConfig = useStore((state) => state.setItemConfig);

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
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Simulation Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
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