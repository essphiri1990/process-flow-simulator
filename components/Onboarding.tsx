import React, { useState, useEffect } from 'react';
import { Play, Zap, MousePointer2, BarChart2, ArrowRight, X } from 'lucide-react';

const ONBOARDING_KEY = 'processFlowSim_onboardingComplete';

const steps = [
  {
    icon: <MousePointer2 size={24} className="text-blue-500" />,
    title: 'Build Your Process',
    description: 'Add Start, Process, and End nodes from the toolbar. Drag between node handles to connect them into a flow.',
  },
  {
    icon: <Zap size={24} className="text-purple-500" />,
    title: 'Enable Auto Feed',
    description: 'Turn on "Auto Feed" in the bottom control bar. This generates items that flow through your process automatically.',
  },
  {
    icon: <Play size={24} className="text-emerald-500" />,
    title: 'Run the Simulation',
    description: 'Press "Run" to start. Watch items move through nodes, queue up at bottlenecks, and complete the process.',
  },
  {
    icon: <BarChart2 size={24} className="text-amber-500" />,
    title: 'Analyze Performance',
    description: 'View real-time metrics in the bottom-right panel. Open the Analytics Dashboard for detailed charts and bottleneck analysis.',
  },
];

interface OnboardingProps {
  onDismiss: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onDismiss }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    onDismiss();
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-2 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Welcome to Process Flow Simulator</h2>
            <p className="text-sm text-slate-500 mt-1">Learn how to build and simulate real processes</p>
          </div>
          <button
            onClick={handleComplete}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
            title="Skip tutorial"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Content */}
        <div className="px-6 py-6">
          <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                {steps[currentStep].icon}
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{steps[currentStep].title}</h3>
                <p className="text-slate-600 text-sm mt-1 leading-relaxed">{steps[currentStep].description}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Step Indicators & Navigation */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <div className="flex gap-2">
            {steps.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  idx === currentStep
                    ? 'bg-blue-500 w-6'
                    : idx < currentStep
                    ? 'bg-blue-300'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleComplete}
              className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-sm"
            >
              {currentStep < steps.length - 1 ? (
                <>Next <ArrowRight size={14} /></>
              ) : (
                'Get Started'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const shouldShowOnboarding = (): boolean => {
  return !localStorage.getItem(ONBOARDING_KEY);
};

export default Onboarding;
