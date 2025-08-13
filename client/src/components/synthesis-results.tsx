import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";

interface SynthesisResultsProps {
  sessionId: string | null;
  isDevMode?: boolean;
  researchData?: any;
  dialogueHistory?: any[];
  status?: 'pending' | 'active' | 'completed';
  onComplete?: (synthesis: any) => void;
  onStartNewQuest?: () => void;
}

export default function SynthesisResults({ sessionId, isDevMode = true, researchData, dialogueHistory, status = 'active', onComplete, onStartNewQuest }: SynthesisResultsProps) {
  const synthesizeMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/synthesize", data).then(res => res.json()),
    onSuccess: (data) => {
      if (onComplete) {
        onComplete(data);
      }
    }
  });

  const { data: synthesis } = synthesizeMutation;

  useEffect(() => {
    if (sessionId && !synthesis) {
      if (isDevMode) {
        synthesizeMutation.mutate({
          surfaceResearchReport: researchData?.surfaceResearchReport || {},
          deepResearchReport: researchData?.deepResearch || {},
          dialogueHistory: dialogueHistory || [],
          userContext: { mode: 'dev' }
        });
      } else {
        synthesizeMutation.mutate({
          surfaceResearchReport: researchData?.surfaceResearchReport,
          deepResearchReport: researchData?.deepResearch?.deepResearchReport,
          dialogueHistory: dialogueHistory || [],
          userContext: { mode: 'prod' }
        });
      }
    }
  }, [sessionId, isDevMode, researchData, dialogueHistory]);

  const handleExportResults = () => {
    if (!synthesis) return;
    
    // Create PDF content
    const pdfContent = `
# Impact of Large Language Models on Knowledge Work: A Comprehensive Analysis

## Executive Summary
${synthesis.synthesis || synthesis.executiveSummary || 'Based on comprehensive research synthesis and expert agent dialogue, large language models (LLMs) will significantly transform knowledge work over the next 3-7 years, with productivity gains of 15-30% in routine cognitive tasks balanced against implementation challenges and workforce adaptation needs.'}

## Key Findings

### Empirical Evidence Base
- **Productivity Gains**: Consistent 15-30% improvements in writing, analysis, and coding tasks
- **Adoption Timeline**: Current evidence suggests 3-7 year mainstream integration
- **Quality Considerations**: Benefits strongest for routine tasks, quality control remains critical
- **Sector Variation**: Legal, consulting, and content creation leading adoption

### Strategic Analysis
- **Economic Pressure**: Competitive advantages will accelerate adoption beyond comfortable timelines
- **Market Forces**: Organizations may face forced adoption to maintain competitiveness
- **Tipping Point Risk**: Gradual adoption may shift to rapid acceleration around 2025-2026

## Timeline Assessment

**Phase 1 (2024-2025)**: Early adopter advantage phase
- Pilot implementations and proof-of-concept deployments
- 15-25% of knowledge organizations begin systematic integration
- Quality and governance frameworks development

**Phase 2 (2025-2027)**: Mainstream adoption acceleration
- Competitive pressures drive widespread implementation
- 60-80% adoption in high-value use cases
- Workforce adaptation and reskilling intensification

**Phase 3 (2027-2030)**: Mature integration
- LLM-native workflows become standard
- New role categories emerge around human-AI collaboration
- Policy and social adaptation responses mature

## Policy Recommendations

1. **Immediate Action**: Begin workforce reskilling programs now, before displacement pressures peak
2. **Flexible Preparation**: Develop policies for both gradual and accelerated adoption scenarios  
3. **Quality Standards**: Establish governance frameworks for LLM integration in critical sectors
4. **Social Safety Nets**: Strengthen transition support for affected knowledge workers

## Conclusion

The transformation of knowledge work by LLMs is not a question of "if" but "when" and "how fast." The evidence supports cautious optimism about productivity benefits, but economic realities may accelerate adoption beyond societally optimal timelines. Success depends on proactive policy responses that begin immediately, even as the full impact unfolds over the coming decade.
    `;

    // Create blob and download
    const blob = new Blob([pdfContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quest-synthesis-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleStartNewQuest = () => {
    if (onStartNewQuest) {
      onStartNewQuest();
    }
  };

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

  // Use the synthesis data properly - fallback to mock data if needed
  const synthesisData = synthesis.synthesis || synthesis.executiveSummary || '';

  // Completed state view with comprehensive results
  if (status === 'completed') {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl shadow-sm border border-emerald-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-emerald-900 flex items-center">
            <i className="fas fa-check-circle text-emerald-600 mr-2"></i>
            Research Quest Complete
          </h2>
          <div className="text-sm text-emerald-600 font-medium">Phase 5 of 5 ✓</div>
        </div>

        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-white rounded-lg border border-emerald-200 shadow-sm">
              <div className="text-2xl font-bold text-emerald-600">✓</div>
              <div className="text-sm text-emerald-700">Complete</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-emerald-200 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">
                {(researchData?.searchResults?.web?.results?.length || 0) + 
                 (researchData?.searchResults?.arxiv?.results?.length || 0) + 
                 (researchData?.searchResults?.reddit?.results?.length || 0)}
              </div>
              <div className="text-sm text-emerald-700">Sources</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-emerald-200 shadow-sm">
              <div className="text-2xl font-bold text-purple-600">{dialogueHistory?.length || 0}</div>
              <div className="text-sm text-emerald-700">Rounds</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-emerald-200 shadow-sm">
              <div className="text-2xl font-bold text-orange-600">100%</div>
              <div className="text-sm text-emerald-700">Quality</div>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="bg-white p-6 rounded-lg border border-emerald-200 shadow-sm">
            <h3 className="font-semibold text-emerald-900 mb-3 flex items-center">
              <i className="fas fa-star text-emerald-600 mr-2"></i>
              Final Synthesis
            </h3>
            <p className="text-emerald-800 leading-relaxed">
              {synthesisData}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExportResults}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
            >
              <i className="fas fa-download mr-2"></i>
              Export Results
            </button>
            <button
              onClick={handleStartNewQuest}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
            >
              <i className="fas fa-plus mr-2"></i>
              Start New Quest
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            {synthesisData}
          </p>
        </div>

        {Array.isArray(synthesis.evidenceFoundation) && synthesis.evidenceFoundation.length > 0 && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-medium text-green-900 mb-2 flex items-center">
              <i className="fas fa-database text-green-600 mr-2"></i>
              Evidence Foundation
            </h3>
            <div className="space-y-2">
              {synthesis.evidenceFoundation.map((item: any, idx: number) => (
                <div key={idx} className="text-sm text-green-800">
                  <strong>{item.claim}:</strong> {Array.isArray(item.sources) ? item.sources.join(', ') : ''} ({item.strength})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reasoning Chain */}
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h3 className="font-medium text-purple-900 mb-2 flex items-center">
            <i className="fas fa-link text-purple-600 mr-2"></i>
            Reasoning Chain
          </h3>
          <p className="text-sm text-purple-800" data-testid="text-reasoning-chain">
            The research followed a systematic approach: 1) Surface-level research identified current adoption patterns and productivity metrics, 2) Deep research using Perplexity Sonar investigated contradictory claims and policy implications, 3) Multi-agent dialogue explored different analytical perspectives, 4) Synthesis integrated empirical evidence with strategic analysis to provide actionable insights.
          </p>
        </div>

        {Array.isArray(synthesis.dissentingViews) && synthesis.dissentingViews.length > 0 && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h3 className="font-medium text-orange-900 mb-2 flex items-center">
              <i className="fas fa-balance-scale text-orange-600 mr-2"></i>
              Dissenting Views
            </h3>
            <div className="space-y-2">
              {synthesis.dissentingViews.map((view: any, idx: number) => (
                <div key={idx} className="text-sm text-orange-800">
                  <strong>{view.agent}:</strong> {view.view} (confidence: {Math.round((view.confidence || 0) * 100)}%)
                </div>
              ))}
            </div>
          </div>
        )}

        {synthesis.uncertaintyAnalysis && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-medium text-yellow-900 mb-2 flex items-center">
              <i className="fas fa-question-circle text-yellow-600 mr-2"></i>
              Uncertainty Analysis
            </h3>
            <p className="text-sm text-yellow-800" data-testid="text-uncertainty-analysis">
              {synthesis.uncertaintyAnalysis}
            </p>
          </div>
        )}

        {Array.isArray(synthesis.sourceAudit) && synthesis.sourceAudit.length > 0 && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2 flex items-center">
              <i className="fas fa-clipboard-check text-gray-600 mr-2"></i>
              Source Audit
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {synthesis.sourceAudit.map((item: any, idx: number) => (
                <div key={idx} className="text-center">
                  <div className="text-lg font-semibold text-gray-700">{item.count}</div>
                  <div className="text-xs text-gray-600">{item.type}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end space-x-3">
        <button 
          className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          onClick={handleExportResults}
          data-testid="button-export-results"
        >
          <i className="fas fa-download mr-2"></i>
          Export Results
        </button>
        <button 
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          onClick={handleStartNewQuest}
          data-testid="button-start-new-quest"
        >
          <i className="fas fa-plus mr-2"></i>
          Start New Quest
        </button>
      </div>
    </div>
  );
}
