import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";

interface SynthesisResultsProps {
  sessionId: string | null;
}

export default function SynthesisResults({ sessionId }: SynthesisResultsProps) {
  const synthesizeMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/synthesize", data).then(res => res.json())
  });

  const { data: synthesis } = synthesizeMutation;

  useEffect(() => {
    if (sessionId && !synthesis) {
      synthesizeMutation.mutate({
        researchData: { /* mock research data */ },
        dialogueHistory: { /* mock dialogue history */ }
      });
    }
  }, [sessionId]);

  if (synthesizeMutation.isPending) {
    return (
      <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <i className="fas fa-magic text-primary mr-2"></i>
            Final Synthesis
          </h2>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
            <span className="text-sm text-primary font-medium">Synthesizing...</span>
          </div>
        </div>
        <div className="space-y-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!synthesis) return null;

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <i className="fas fa-magic text-primary mr-2"></i>
          Final Synthesis
        </h2>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-success rounded-full"></div>
          <span className="text-sm text-success font-medium" data-testid="status-synthesis-complete">Complete</span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Executive Summary */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2 flex items-center">
            <i className="fas fa-summary text-blue-600 mr-2"></i>
            Executive Summary
          </h3>
          <p className="text-sm text-blue-800" data-testid="text-executive-summary">
            {synthesis.executiveSummary}
          </p>
          {synthesis.confidenceInterval && (
            <div className="mt-2 text-xs text-blue-700">
              Confidence Interval: {Math.round(synthesis.confidenceInterval[0] * 100)}% - {Math.round(synthesis.confidenceInterval[1] * 100)}%
            </div>
          )}
        </div>

        {/* Evidence Foundation */}
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-medium text-green-900 mb-2 flex items-center">
            <i className="fas fa-database text-green-600 mr-2"></i>
            Evidence Foundation
          </h3>
          <div className="space-y-2">
            {synthesis.evidenceFoundation?.map((evidence: any, index: number) => (
              <div key={index} className="text-sm text-green-800">
                <strong data-testid={`evidence-claim-${index}`}>{evidence.claim}:</strong>
                <span className="ml-2" data-testid={`evidence-sources-${index}`}>
                  {evidence.sources?.join(", ")} ({evidence.strength} confidence)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Reasoning Chain */}
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h3 className="font-medium text-purple-900 mb-2 flex items-center">
            <i className="fas fa-link text-purple-600 mr-2"></i>
            Reasoning Chain
          </h3>
          <p className="text-sm text-purple-800" data-testid="text-reasoning-chain">
            {synthesis.reasoningChain}
          </p>
        </div>

        {/* Dissenting Views */}
        {synthesis.dissentingViews?.length > 0 && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h3 className="font-medium text-orange-900 mb-2 flex items-center">
              <i className="fas fa-balance-scale text-orange-600 mr-2"></i>
              Dissenting Views
            </h3>
            <div className="space-y-2">
              {synthesis.dissentingViews.map((view: any, index: number) => (
                <div key={index} className="text-sm text-orange-800">
                  <strong data-testid={`dissenting-view-${index}`}>{view.view}:</strong>
                  <span className="ml-2" data-testid={`dissenting-evidence-${index}`}>
                    {view.evidence} (confidence: {Math.round(view.confidence * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Uncertainty Analysis */}
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-medium text-yellow-900 mb-2 flex items-center">
            <i className="fas fa-question-circle text-yellow-600 mr-2"></i>
            Uncertainty Analysis
          </h3>
          <p className="text-sm text-yellow-800" data-testid="text-uncertainty-analysis">
            {synthesis.uncertaintyAnalysis}
          </p>
        </div>

        {/* Source Audit */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2 flex items-center">
            <i className="fas fa-clipboard-check text-gray-600 mr-2"></i>
            Source Audit
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {synthesis.sourceAudit?.map((audit: any, index: number) => (
              <div key={index} className="text-center">
                <div className="text-lg font-semibold text-gray-700" data-testid={`audit-count-${index}`}>
                  {audit.count}
                </div>
                <div className="text-xs text-gray-600" data-testid={`audit-type-${index}`}>
                  {audit.type} ({audit.percentage}%)
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end space-x-3">
        <button 
          className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          data-testid="button-export-results"
        >
          <i className="fas fa-download mr-2"></i>
          Export Results
        </button>
        <button 
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          data-testid="button-start-new-quest"
        >
          <i className="fas fa-plus mr-2"></i>
          Start New Quest
        </button>
      </div>
    </div>
  );
}
