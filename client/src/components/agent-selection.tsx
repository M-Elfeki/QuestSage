import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface AgentSelectionProps {
  onAgentsSelected: (config: any) => void;
  researchData?: any;
  sessionId?: string | null;
  status?: 'pending' | 'active' | 'completed';
}

export default function AgentSelection({ onAgentsSelected, researchData, sessionId, status = 'active' }: AgentSelectionProps) {
  const [isVisible, setIsVisible] = useState(true);

  const selectAgentsMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/select-agents", data).then(res => res.json()),
    onSuccess: (agentConfig) => {
      // Automatically proceed after a short delay to show the selection
      setTimeout(() => {
        onAgentsSelected(agentConfig);
      }, 2000);
    }
  });

  // Automatically start agent selection when component mounts
  useEffect(() => {
    if (isVisible && researchData) {
      selectAgentsMutation.mutate({
        sessionId,
        researchData: researchData,
        userContext: { 
          preferences: "comprehensive analysis",
          expertise: "general knowledge",
          timeConstraint: "flexible"
        }
      });
    }
  }, [isVisible, researchData]);

  if (!isVisible) return null;

  // Completed state view
  if (status === 'completed') {
    return (
      <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-blue-900 flex items-center">
            <i className="fas fa-check-circle text-blue-600 mr-2"></i>
            Agent Configuration Complete
          </h2>
          <div className="text-sm text-blue-600 font-medium">Phase 3 of 5 ✓</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ChatGPT Agent Config - Completed */}
          <div className="border border-blue-200 rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-blue-900 flex items-center">
                <i className="fas fa-robot text-green-500 mr-2"></i>
                ChatGPT Agent
              </h3>
              <div className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                Configured ✓
              </div>
            </div>
            <div className="space-y-1 text-xs text-blue-700">
              <div>• Inductive approach</div>
              <div>• Empirical data maximizer</div>
              <div>• Short-term dynamics focus</div>
            </div>
          </div>

          {/* Gemini Agent Config - Completed */}
          <div className="border border-blue-200 rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-blue-900 flex items-center">
                <i className="fas fa-robot text-blue-500 mr-2"></i>
                Gemini Agent
              </h3>
              <div className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                Configured ✓
              </div>
            </div>
            <div className="space-y-1 text-xs text-blue-700">
              <div>• Deductive approach</div>
              <div>• Theoretical model challenger</div>
              <div>• Long-term structural analysis</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <i className="fas fa-users text-primary mr-2"></i>
          Strategic Agent Selection
        </h2>
        <div className="text-sm text-gray-500" data-testid="text-phase-indicator">Phase 3 of 5</div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ChatGPT Agent Config */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900 flex items-center">
              <i className="fas fa-robot text-green-500 mr-2"></i>
              ChatGPT Agent
            </h3>
            <div className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full" data-testid="badge-chatgpt-approach">
              Inductive
            </div>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <i className="fas fa-brain text-xs text-gray-400"></i>
              <span data-testid="text-chatgpt-pattern">Pattern-finding approach</span>
            </div>
            <div className="flex items-center space-x-2">
              <i className="fas fa-chart-bar text-xs text-gray-400"></i>
              <span data-testid="text-chatgpt-data">Empirical data maximizer</span>
            </div>
            <div className="flex items-center space-x-2">
              <i className="fas fa-clock text-xs text-gray-400"></i>
              <span data-testid="text-chatgpt-temporal">Short-term dynamics focus</span>
            </div>
          </div>
        </div>

        {/* Gemini Agent Config */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900 flex items-center">
              <i className="fas fa-robot text-blue-500 mr-2"></i>
              Gemini Agent
            </h3>
            <div className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full" data-testid="badge-gemini-approach">
              Deductive
            </div>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <i className="fas fa-sitemap text-xs text-gray-400"></i>
              <span data-testid="text-gemini-framework">Framework-building approach</span>
            </div>
            <div className="flex items-center space-x-2">
              <i className="fas fa-question-circle text-xs text-gray-400"></i>
              <span data-testid="text-gemini-challenger">Theoretical model challenger</span>
            </div>
            <div className="flex items-center space-x-2">
              <i className="fas fa-telescope text-xs text-gray-400"></i>
              <span data-testid="text-gemini-temporal">Long-term structural analysis</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        {selectAgentsMutation.isPending ? (
          <div className="flex items-center justify-center space-x-2 text-blue-600">
            <i className="fas fa-spinner fa-spin"></i>
            <span>Configuring Agents...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2 text-green-600">
            <i className="fas fa-check-circle"></i>
            <span>Agents configured successfully! Proceeding to dialogue...</span>
          </div>
        )}
      </div>
    </div>
  );
}
