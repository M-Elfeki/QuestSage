import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import ReactMarkdown from "react-markdown";

interface DialogueInterfaceProps {
  sessionId: string | null;
  isDevMode?: boolean;
  researchData?: any;
  agentConfigs?: any;
  successCriteria?: string[];
  status?: 'pending' | 'active' | 'completed';
  onComplete: (dialogueHistory: any[]) => void;
}

export default function DialogueInterface({ sessionId, isDevMode = true, researchData, agentConfigs, successCriteria = [], status = 'active', onComplete }: DialogueInterfaceProps) {
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRounds] = useState(7);
  const [dialogueHistory, setDialogueHistory] = useState<any[]>([]);
  const [lastSteering, setLastSteering] = useState<{ feedback: string[]; questions: string[] } | null>(null);
  const [successCriteriaStatus, setSuccessCriteriaStatus] = useState<Record<string, any>>({});

  const { data: dialogues } = useQuery({
    queryKey: ["/api/research-sessions", sessionId, "dialogues"],
    enabled: !!sessionId
  });

  const agentDialogueMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/agent-dialogue", data).then(res => res.json()),
    onSuccess: (data) => {
      setDialogueHistory(prev => [...prev, data.chatgpt, data.gemini]);
      
      // Evaluate whether to continue following specification decision tree
      evaluateDialogueMutation.mutate({
        context: { 
          roundNumber: currentRound, 
          dialogueHistory: [...dialogueHistory, data.chatgpt, data.gemini],
          researchData: researchData || {},
          successCriteria: successCriteria
        }
      });
    }
  });

  const evaluateDialogueMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/evaluate-dialogue", data).then(res => res.json()),
    onSuccess: async (evaluation) => {
      console.log('Dialogue evaluation result:', evaluation);
      setLastSteering({ feedback: evaluation.feedback || [], questions: evaluation.questions || [] });
      
      // Update success criteria status if provided
      if (evaluation.successCriteriaStatus) {
        setSuccessCriteriaStatus(evaluation.successCriteriaStatus);
      }
      
      if (evaluation.decision === "conclude") {
        onComplete([...dialogueHistory]);
        return;
      }
      
      // Check alignment before continuing (as per spec requirement)
      if (evaluation.decision === "continue") {
        try {
          const alignmentCheck = await apiRequest("POST", "/api/check-alignment", {
            conversationHistory: dialogueHistory,
            userIntent: { /* would include user context */ },
            currentRound
          }).then(res => res.json());
          
          if (alignmentCheck.recommendAction === 'clarify') {
            // Show checkpoint question to user and halt dialogue
            console.error('Alignment check requires clarification:', alignmentCheck.checkpointQuestion);
            alert(`Alignment Issue Detected:\n\n${alignmentCheck.checkpointQuestion || 'The dialogue has drifted from your original intent.'}\n\nDialogue has been paused for realignment.`);
            // Stop the dialogue - do not continue
            return;
          }
          
          if (alignmentCheck.recommendAction === 'realign') {
            // Major realignment needed - stop dialogue
            console.error('Major alignment issue - dialogue stopped');
            alert('The dialogue has significantly drifted from your original intent. Please restart with a clearer query.');
            onComplete([...dialogueHistory]);
            return;
          }
          
          // Only continue if alignment check passes
          if (alignmentCheck.recommendAction === 'proceed') {
            setCurrentRound(prev => prev + 1);
            setTimeout(() => {
              startDialogueRound();
            }, 2000);
          }
          
        } catch (alignmentError) {
          console.error('Alignment check failed:', alignmentError);
          // Do NOT continue on alignment check failure - treat as critical error
          alert('System error: Unable to verify dialogue alignment. Dialogue has been stopped for safety.');
          onComplete([...dialogueHistory]);
          return;
        }
      }
    }
  });

  const startDialogueRound = () => {
    if (!sessionId) return;

    agentDialogueMutation.mutate({
      sessionId,
      roundNumber: currentRound,
      agentConfigs: agentConfigs || {
        chatgpt: { approach: "inductive", focus: "pattern-finding", evidenceWeight: "empirical-maximizer", temporal: "short-term-dynamics", risk: "base-rate-anchored" },
        gemini: { approach: "deductive", focus: "framework-building", evidenceWeight: "theoretical-challenger", temporal: "long-term-structural", risk: "tail-risk-explorer" }
      },
      context: { 
        dialogueHistory,
        researchData: researchData || {},
        steering: lastSteering || undefined
      }
    });
  };

  useEffect(() => {
    if (sessionId && dialogueHistory.length === 0) {
      startDialogueRound();
    }
  }, [sessionId]);

  // Completed state view
  if (status === 'completed') {
    return (
      <div className="bg-purple-50 rounded-xl shadow-sm border border-purple-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-purple-900 flex items-center">
            <i className="fas fa-check-circle text-purple-600 mr-2"></i>
            Agent Dialogue Complete
          </h2>
          <div className="text-sm text-purple-600 font-medium">Phase 4 of 5 ✓</div>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-white rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-purple-600">{dialogueHistory.length}</div>
              <div className="text-sm text-purple-700">Total Rounds</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-green-600">
                {Object.values(successCriteriaStatus).filter(s => s?.completed).length}
              </div>
              <div className="text-sm text-purple-700">Criteria Met</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-blue-600">
                {dialogueHistory.reduce((acc, round) => acc + (round.exchanges?.length || 0), 0)}
              </div>
              <div className="text-sm text-purple-700">Total Exchanges</div>
            </div>
          </div>
          
          {dialogueHistory.length > 0 && (
            <div className="bg-white p-4 rounded-lg border border-purple-200">
              <div className="text-sm font-medium text-purple-900 mb-2">Final Insights Summary</div>
              <div className="text-sm text-purple-700">
                Multi-agent dialogue completed with comprehensive exploration of research dimensions.
                {successCriteria.length > 0 && (
                  <span className="ml-1">
                    Successfully addressed {Object.values(successCriteriaStatus).filter(s => s?.completed).length} 
                    of {successCriteria.length} success criteria.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <i className="fas fa-comments text-primary mr-2"></i>
          Agent Dialogue System
        </h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500" data-testid="text-round-counter">Round {currentRound} of {maxRounds}</div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              agentDialogueMutation.isPending ? "bg-primary animate-pulse" : "bg-success"
            }`}></div>
          <span className={`text-xs font-medium ${
            agentDialogueMutation.isPending ? "text-primary" : "text-success"
          }`} data-testid="status-dialogue">
            {agentDialogueMutation.isPending ? "Agents Discussing..." : "Active"}
          </span>
          </div>
        </div>
        {lastSteering && (lastSteering.feedback?.length || lastSteering.questions?.length) ? (
          <div className="text-xs text-gray-600">
            <span className="font-medium">Round Guidance:</span>
            {lastSteering.questions?.length > 0 && (
              <div className="mt-1">Questions: {lastSteering.questions.join('; ')}</div>
            )}
            {lastSteering.feedback?.length > 0 && (
              <div className="mt-1">Feedback: {lastSteering.feedback.join('; ')}</div>
            )}
          </div>
        ) : null}
      </div>
      
      {/* Success Criteria Display */}
      {successCriteria && successCriteria.length > 0 && (
        <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <h3 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center">
            <i className="fas fa-tasks mr-2"></i>
            Success Criteria for Dialogue
          </h3>
          <ul className="space-y-2">
            {successCriteria.map((criterion, index) => {
              // Try to find status for this criterion
              const statusKey = Object.keys(successCriteriaStatus).find(key => 
                key.toLowerCase().includes(criterion.toLowerCase().substring(0, 20)) ||
                criterion.toLowerCase().includes(key.toLowerCase())
              );
              const status = statusKey ? successCriteriaStatus[statusKey] : null;
              
              return (
                <li key={index} className="text-sm text-indigo-800 flex items-start">
                  {status?.status === 'completed' ? (
                    <i className="fas fa-check-circle text-green-600 mr-2 mt-0.5 text-xs"></i>
                  ) : status?.status === 'partial' ? (
                    <i className="fas fa-adjust text-yellow-600 mr-2 mt-0.5 text-xs"></i>
                  ) : (
                    <i className="far fa-circle text-indigo-400 mr-2 mt-0.5 text-xs"></i>
                  )}
                  <div className="flex-1">
                    <span className={status?.status === 'completed' ? 'line-through text-indigo-600' : ''}>
                      {criterion}
                    </span>
                    {status?.evidence && (
                      <div className="text-xs text-indigo-600 mt-0.5 italic">
                        {status.evidence}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between text-xs">
            <div className="text-indigo-700 italic">
              Agents are working to address these key areas through their dialogue
            </div>
            {Object.keys(successCriteriaStatus).length > 0 && (
              <div className="flex items-center space-x-4 text-indigo-600">
                <span className="flex items-center">
                  <i className="fas fa-check-circle text-green-600 mr-1"></i>
                  Completed: {Object.values(successCriteriaStatus).filter((s: any) => s.status === 'completed').length}
                </span>
                <span className="flex items-center">
                  <i className="fas fa-adjust text-yellow-600 mr-1"></i>
                  Partial: {Object.values(successCriteriaStatus).filter((s: any) => s.status === 'partial').length}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Dialogue Messages */}
      <div className="space-y-4 max-h-96 overflow-y-auto" data-testid="dialogue-messages">
        {dialogueHistory.length === 0 && agentDialogueMutation.isPending ? (
          <div className="text-center py-8">
            <i className="fas fa-spinner fa-spin text-primary text-2xl mb-4"></i>
            <p className="text-gray-600">Agents are analyzing the research data and formulating their initial positions...</p>
          </div>
        ) : (
          dialogueHistory.map((message, index) => (
            <div key={index} className={`flex items-start space-x-3 ${
              message.agentType === "gemini" ? "justify-end" : ""
            }`}>
              {message.agentType === "chatgpt" && (
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <i className="fas fa-robot text-green-600 text-sm"></i>
                </div>
              )}
              <div className={`flex-1 max-w-lg ${message.agentType === "gemini" ? "order-first" : ""}`}>
                <div className={`rounded-lg p-3 border ${
                  message.agentType === "chatgpt" 
                    ? "bg-green-50 border-green-200" 
                    : "bg-blue-50 border-blue-200"
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${
                      message.agentType === "chatgpt" ? "text-green-800" : "text-blue-800"
                    }`} data-testid={`agent-name-${index}`}>
                      {message.agentType === "chatgpt" ? "ChatGPT Agent" : "Gemini Agent"}
                    </span>
                    <span className={`text-xs ${
                      message.agentType === "chatgpt" ? "text-green-600" : "text-blue-600"
                    }`} data-testid={`agent-approach-${index}`}>
                      {message.agentType === "chatgpt" ? "Inductive Approach" : "Deductive Framework"}
                    </span>
                  </div>
                  <div className={`text-sm prose prose-sm max-w-none ${
                    message.agentType === "chatgpt" ? "text-green-700" : "text-blue-700"
                  }`} data-testid={`agent-message-${index}`}>
                    <ReactMarkdown 
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                        li: ({ children }) => <li className="mb-1">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                        h1: ({ children }) => <h1 className="text-base font-bold mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                      }}
                    >
                      {message.message}
                    </ReactMarkdown>
                  </div>
                  {message.confidenceScore && (
                    <div className="mt-2 text-xs text-gray-600">
                      Confidence: {message.confidenceScore}%
                    </div>
                  )}
                </div>
              </div>
              {message.agentType === "gemini" && (
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <i className="fas fa-robot text-blue-600 text-sm"></i>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Dialogue Controls */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          <i className="fas fa-info-circle mr-1"></i>
          <span data-testid="text-dialogue-info">Agents are exploring different perspectives through structured dialogue</span>
        </div>
        <Button
          variant="outline"
          disabled={!agentDialogueMutation.isPending}
          data-testid="button-pause-dialogue"
        >
          <i className="fas fa-pause mr-2"></i>
          Pause Dialogue
        </Button>
      </div>
    </div>
  );
}
