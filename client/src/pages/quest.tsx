import { useState } from "react";
import ProcessStepper from "@/components/process-stepper";
import QueryInput from "@/components/query-input";
import IntentClarification from "@/components/intent-clarification";
import ResearchPipeline from "@/components/research-pipeline";
import SystemStatus from "@/components/system-status";
import ResearchFindings from "@/components/research-findings";
import SourceMetrics from "@/components/source-metrics";
import AgentSelection from "@/components/agent-selection";
import DialogueInterface from "@/components/dialogue-interface";
import SynthesisResults from "@/components/synthesis-results";
import { SettingsDialog } from "@/components/ui/settings-dialog";
import { EssayDialog } from "@/components/ui/essay-dialog";

export default function Quest() {
  const [currentStage, setCurrentStage] = useState<string>("intentClarification");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [researchProgress, setResearchProgress] = useState(0);
  const [researchData, setResearchData] = useState<any>(null);
  const [synthesisData, setSynthesisData] = useState<any>(null);

  return (
    <div className="font-inter bg-background min-h-screen">
      {/* Header */}
      <header className="bg-surface shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <i className="fas fa-search text-white text-sm"></i>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Quest</h1>
              <span className="text-sm text-gray-500">Multi-Agent Research System</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-success rounded-full"></div>
                <span>System Ready</span>
              </div>
              {synthesisData && (
                <EssayDialog 
                  sessionId={sessionId || ''}
                  researchData={researchData}
                />
              )}
              <SettingsDialog />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Progress Stepper */}
        <div className="mb-8">
          <ProcessStepper 
            currentStage={currentStage} 
            onStageChange={setCurrentStage}
          />
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Query Input & Current Stage */}
          <div className="lg:col-span-2 space-y-6">
            <QueryInput 
              onQuerySubmit={(query) => {
                setCurrentStage("intentClarification");
              }}
            />

            {currentStage === "intentClarification" && (
              <IntentClarification 
                onContinue={() => setCurrentStage("research")}
              />
            )}

            {currentStage === "research" && (
              <ResearchPipeline 
                sessionId={sessionId}
                onComplete={(data) => {
                  setResearchData(data);
                  setCurrentStage("agentSelection");
                }}
                onProgress={setResearchProgress}
              />
            )}

            {currentStage === "agentSelection" && (
              <AgentSelection 
                onAgentsSelected={() => setCurrentStage("dialogue")}
              />
            )}

            {currentStage === "dialogue" && (
              <DialogueInterface 
                sessionId={sessionId}
                onComplete={() => setCurrentStage("synthesis")}
              />
            )}

            {currentStage === "synthesis" && (
              <SynthesisResults 
                sessionId={sessionId}
                onComplete={(synthesis) => {
                  setSynthesisData(synthesis);
                }}
              />
            )}
          </div>

          {/* Right Column - System Status & Research Findings */}
          <div className="space-y-6">
            <SystemStatus />
            <ResearchFindings progress={researchProgress} />
            <SourceMetrics />
          </div>
        </div>
      </div>
    </div>
  );
}
