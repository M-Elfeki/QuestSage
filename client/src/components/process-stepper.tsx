interface ProcessStepperProps {
  currentStage: string;
  onStageChange: (stage: string) => void;
}

const STAGES = [
  { id: "intentClarification", label: "Intent Clarification" },
  { id: "research", label: "Research" },
  { id: "agentSelection", label: "Agent Selection" },
  { id: "dialogue", label: "Dialogue" },
  { id: "synthesis", label: "Synthesis" }
];

export default function ProcessStepper({ currentStage, onStageChange }: ProcessStepperProps) {
  const getCurrentStageIndex = () => {
    return STAGES.findIndex(stage => stage.id === currentStage);
  };

  const currentIndex = getCurrentStageIndex();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        {STAGES.map((stage, index) => (
          <div key={stage.id} className="flex items-center">
            <div className="flex items-center">
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  index <= currentIndex 
                    ? "bg-primary text-white" 
                    : "bg-gray-200 text-gray-600"
                }`}
                data-testid={`step-${stage.id}`}
              >
                {index + 1}
              </div>
              <span 
                className={`ml-2 text-sm font-medium transition-colors ${
                  index <= currentIndex 
                    ? "text-primary" 
                    : "text-gray-500"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {index < STAGES.length - 1 && (
              <div className="w-12 h-px bg-gray-300 ml-4"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
