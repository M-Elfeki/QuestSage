import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface DialogueInterfaceProps {
  sessionId: string | null;
  onComplete: () => void;
}

export default function DialogueInterface({ sessionId, onComplete }: DialogueInterfaceProps) {
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRounds] = useState(7);
  const [dialogueHistory, setDialogueHistory] = useState<any[]>([]);

  const { data: dialogues } = useQuery({
    queryKey: ["/api/research-sessions", sessionId, "dialogues"],
    enabled: !!sessionId
  });

  const agentDialogueMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/agent-dialogue", data).then(res => res.json()),
    onSuccess: (data) => {
      setDialogueHistory(prev => [...prev, data.chatgpt, data.gemini]);
      
      // Evaluate whether to continue
      evaluateDialogueMutation.mutate({
        context: { roundNumber: currentRound, dialogueHistory: [...dialogueHistory, data.chatgpt, data.gemini] }
      });
    }
  });

  const evaluateDialogueMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/evaluate-dialogue", data).then(res => res.json()),
    onSuccess: (evaluation) => {
      if (evaluation.decision === "conclude" || currentRound >= maxRounds) {
        onComplete();
      } else {
        setCurrentRound(prev => prev + 1);
        // Continue with next round
        setTimeout(() => {
          startDialogueRound();
        }, 2000);
      }
    }
  });

  const startDialogueRound = () => {
    if (!sessionId) return;

    agentDialogueMutation.mutate({
      sessionId,
      roundNumber: currentRound,
      agentConfigs: {
        chatgpt: { approach: "inductive", focus: "pattern-finding" },
        gemini: { approach: "deductive", focus: "framework-building" }
      },
      context: { dialogueHistory }
    });
  };

  useEffect(() => {
    if (sessionId && dialogueHistory.length === 0) {
      startDialogueRound();
    }
  }, [sessionId]);

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
      </div>
      
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
                  <p className={`text-sm ${
                    message.agentType === "chatgpt" ? "text-green-700" : "text-blue-700"
                  }`} data-testid={`agent-message-${index}`}>
                    {message.message}
                  </p>
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
