import { useState, useEffect } from "react";
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
import { ModeSelector } from "@/components/mode-selector";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Quest() {
  const [currentStage, setCurrentStage] = useState<string>("intentClarification");
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState<string>("");
  const [clarifiedIntent, setClarifiedIntent] = useState<any>(null);
  const [researchProgress, setResearchProgress] = useState(0);
  const [researchData, setResearchData] = useState<any>(null);
  const [synthesisData, setSynthesisData] = useState<any>(null);
  const [isDevMode, setIsDevMode] = useState<boolean>(true);
  const [isModeUpdating, setIsModeUpdating] = useState<boolean>(false);
  const [agentSelection, setAgentSelection] = useState<any>(null);
  const [dialoguesForSynthesis, setDialoguesForSynthesis] = useState<any[]>([]);

  // Helper functions for stage management
  const getStageStatus = (stage: string) => {
    if (completedStages.has(stage)) return 'completed';
    if (currentStage === stage) return 'active';
    return 'pending';
  };

  const completeStage = (stage: string, nextStage: string) => {
    setCompletedStages(prev => {
      const newSet = new Set(prev);
      newSet.add(stage);
      return newSet;
    });
    setCurrentStage(nextStage);
  };

  // Fetch current mode from server on component mount
  useEffect(() => {
    const fetchCurrentMode = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/config');
        const config = await response.json();
        setIsDevMode(config.mode === 'dev');
      } catch (error) {
        console.error('Failed to fetch current mode:', error);
      }
    };
    
    fetchCurrentMode();
  }, []);

  const handleModeToggle = async (checked: boolean) => {
    setIsModeUpdating(true);
    try {
      const response = await fetch('http://localhost:3000/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: checked ? 'dev' : 'prod' })
      });
      
      if (response.ok) {
        setIsDevMode(checked);
        // Show success feedback
        const modeName = checked ? 'Development' : 'Production';
        console.log(`Successfully switched to ${modeName} mode`);
      } else {
        throw new Error('Failed to update mode');
      }
    } catch (error) {
      console.error('Failed to update mode:', error);
      // Revert the toggle if the update failed
      setIsDevMode(!checked);
      alert('Failed to update mode. Please try again.');
    } finally {
      setIsModeUpdating(false);
    }
  };

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
              {/* Dev/Prod Mode Toggle */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="mode-toggle"
                    checked={isDevMode}
                    onCheckedChange={handleModeToggle}
                    disabled={isModeUpdating}
                  />
                  <Label htmlFor="mode-toggle" className="text-sm font-medium">
                    {isModeUpdating ? 'Updating...' : (isDevMode ? 'Dev Mode' : 'Prod Mode')}
                  </Label>
                </div>
                <div className="ml-2 text-xs text-gray-500">
                  {isModeUpdating ? (
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      Updating...
                    </span>
                  ) : isDevMode ? (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      Dummy Workflow
                    </span>
                  ) : (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      Real APIs
                    </span>
                  )}
                </div>
              </div>
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
        {/* Mode Selector */}
        <div className="mb-6">
          <ModeSelector />
        </div>

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
                setUserQuery(query);
                setCurrentStage("intentClarification");
              }}
            />

            {/* Stage 1: Intent Clarification */}
            {(getStageStatus("intentClarification") !== "pending") && (
              <div className="transition-all duration-500 ease-in-out">
                <IntentClarification 
                  query={userQuery}
                  status={getStageStatus("intentClarification")}
                  onContinue={(sessionId, intent) => {
                    setSessionId(sessionId);
                    setClarifiedIntent(intent);
                    completeStage("intentClarification", "research");
                  }}
                />
              </div>
            )}

            {/* Stage 2: Research Pipeline */}
            {(getStageStatus("research") !== "pending") && (
              <div className="transition-all duration-500 ease-in-out">
                <ResearchPipeline 
                  sessionId={sessionId}
                  clarifiedIntent={clarifiedIntent}
                  isDevMode={isDevMode}
                  status={getStageStatus("research")}
                  onComplete={(data) => {
                    setResearchData(data);
                    completeStage("research", "agentSelection");
                  }}
                  onProgress={setResearchProgress}
                />
              </div>
            )}

            {/* Stage 3: Agent Selection */}
            {(getStageStatus("agentSelection") !== "pending") && (
              <div className="transition-all duration-500 ease-in-out">
                <AgentSelection 
                  sessionId={sessionId}
                  researchData={researchData}
                  status={getStageStatus("agentSelection")}
                  onAgentsSelected={(config) => {
                    setAgentSelection(config);
                    completeStage("agentSelection", "dialogue");
                  }}
                />
              </div>
            )}

            {/* Stage 4: Agent Dialogue */}
            {(getStageStatus("dialogue") !== "pending") && (
              <div className="transition-all duration-500 ease-in-out">
                <DialogueInterface 
                  sessionId={sessionId}
                  isDevMode={isDevMode}
                  researchData={researchData}
                  status={getStageStatus("dialogue")}
                  agentConfigs={agentSelection ? { chatgpt: agentSelection.chatgptConfig, gemini: agentSelection.geminiConfig } : undefined}
                  successCriteria={agentSelection?.successCriteria || []}
                  userIntent={clarifiedIntent}
                  onComplete={(history) => {
                    setDialoguesForSynthesis(history);
                    completeStage("dialogue", "synthesis");
                  }}
                />
              </div>
            )}

            {/* Stage 5: Final Synthesis */}
            {(getStageStatus("synthesis") !== "pending") && (
              <div className="transition-all duration-500 ease-in-out">
                <SynthesisResults 
                  sessionId={sessionId}
                  isDevMode={isDevMode}
                  researchData={researchData}
                  dialogueHistory={dialoguesForSynthesis}
                  status={getStageStatus("synthesis")}
                  onComplete={(synthesis) => {
                    setSynthesisData(synthesis);
                    setCompletedStages(prev => {
                      const newSet = new Set(prev);
                      newSet.add("synthesis");
                      return newSet;
                    });
                  }}
                  onStartNewQuest={() => {
                    // Reset all state to start a new quest
                    setCurrentStage("intentClarification");
                    setCompletedStages(new Set());
                    setSessionId(null);
                    setUserQuery("");
                    setClarifiedIntent(null);
                    setResearchProgress(0);
                    setResearchData(null);
                    setAgentSelection(null);
                    setDialoguesForSynthesis([]);
                    setSynthesisData(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* Right Column - System Status & Research Findings */}
          <div className="space-y-6">
            <SystemStatus />
            <ResearchFindings progress={researchProgress} researchData={researchData} />
            <SourceMetrics researchData={researchData} />
          </div>
        </div>
      </div>
    </div>
  );
}
