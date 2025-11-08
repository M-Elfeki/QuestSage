import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface SynthesisResultsProps {
  sessionId: string | null;
  researchData?: any;
  dialogueHistory?: any[];
  status?: 'pending' | 'active' | 'completed';
  onComplete?: (synthesis: any) => void;
  onStartNewQuest?: () => void;
}

export default function SynthesisResults({ sessionId, researchData, dialogueHistory, status = 'active', onComplete, onStartNewQuest }: SynthesisResultsProps) {
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
      synthesizeMutation.mutate({
        sessionId: sessionId, // Include sessionId for model selection
        surfaceResearchReport: researchData?.surfaceResearchReport,
        deepResearchReport: researchData?.deepResearch?.deepResearchReport,
        dialogueHistory: dialogueHistory || [],
        userContext: {}
      });
    }
  }, [sessionId, researchData, dialogueHistory]);

  const handleExportResults = () => {
    if (!synthesis) return;
    
    // Format the actual synthesis data
    const formatArray = (arr: any[] | undefined, prefix: string = '- ') => {
      if (!Array.isArray(arr) || arr.length === 0) return '';
      return arr.map(item => `${prefix}${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n');
    };

    const formatAppendix = (appendix: any) => {
      if (!appendix || typeof appendix !== 'object') return '';
      let result = '';
      if (Array.isArray(appendix.surfaceHighlights) && appendix.surfaceHighlights.length > 0) {
        result += '\n### Surface Research Highlights\n' + formatArray(appendix.surfaceHighlights);
      }
      if (Array.isArray(appendix.deepHighlights) && appendix.deepHighlights.length > 0) {
        result += '\n### Deep Research Highlights\n' + formatArray(appendix.deepHighlights);
      }
      if (Array.isArray(appendix.dialogueConsensus) && appendix.dialogueConsensus.length > 0) {
        result += '\n### Dialogue Consensus\n' + formatArray(appendix.dialogueConsensus);
      }
      if (Array.isArray(appendix.openQuestions) && appendix.openQuestions.length > 0) {
        result += '\n### Open Questions\n' + formatArray(appendix.openQuestions);
      }
      if (Array.isArray(appendix.userConsiderations) && appendix.userConsiderations.length > 0) {
        result += '\n### User Considerations\n' + formatArray(appendix.userConsiderations);
      }
      if (Array.isArray(appendix.alignmentNotes) && appendix.alignmentNotes.length > 0) {
        result += '\n### Alignment Notes\n' + formatArray(appendix.alignmentNotes);
      }
      if (appendix.confidenceRationale) {
        result += `\n### Confidence Rationale\n${appendix.confidenceRationale}`;
      }
      return result;
    };

    // Create markdown content from actual synthesis data
    const pdfContent = `# Research Synthesis Report

Generated: ${new Date().toLocaleString()}

## Executive Summary

${synthesis.executiveSummary || synthesis.synthesis || 'No executive summary available.'}

## Key Findings

${formatArray(synthesis.keyFindings, '- ') || 'No key findings available.'}

${synthesis.recommendations && Array.isArray(synthesis.recommendations) && synthesis.recommendations.length > 0 ? `## Recommendations

${formatArray(synthesis.recommendations, '1. ')}` : ''}

${synthesis.nextSteps && Array.isArray(synthesis.nextSteps) && synthesis.nextSteps.length > 0 ? `## Next Steps

${formatArray(synthesis.nextSteps, '1. ')}` : ''}

${synthesis.risks && Array.isArray(synthesis.risks) && synthesis.risks.length > 0 ? `## Risks

${formatArray(synthesis.risks, '- ')}` : ''}

${synthesis.confidence ? `## Confidence Level

${synthesis.confidence}` : ''}

${synthesis.appendix ? `## Appendix${formatAppendix(synthesis.appendix)}` : ''}
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

  // Format the full synthesis report for display
  const formatSynthesisForDisplay = (syn: any): string => {
    if (!syn) return '';
    
    // If there's already a formatted synthesis string, use it
    if (syn.synthesis && typeof syn.synthesis === 'string') {
      return syn.synthesis;
    }
    
    // Otherwise, build formatted markdown from the structured data
    let content = '';
    
    if (syn.executiveSummary) {
      content += `## Executive Summary\n\n${syn.executiveSummary}\n\n`;
    }
    
    if (Array.isArray(syn.keyFindings) && syn.keyFindings.length > 0) {
      content += `## Key Findings\n\n`;
      syn.keyFindings.forEach((finding: any) => {
        const text = typeof finding === 'string' ? finding : JSON.stringify(finding);
        content += `- ${text}\n`;
      });
      content += '\n';
    }
    
    if (Array.isArray(syn.recommendations) && syn.recommendations.length > 0) {
      content += `## Recommendations\n\n`;
      syn.recommendations.forEach((rec: any, idx: number) => {
        const text = typeof rec === 'string' ? rec : JSON.stringify(rec);
        content += `${idx + 1}. ${text}\n`;
      });
      content += '\n';
    }
    
    if (Array.isArray(syn.nextSteps) && syn.nextSteps.length > 0) {
      content += `## Next Steps\n\n`;
      syn.nextSteps.forEach((step: any, idx: number) => {
        const text = typeof step === 'string' ? step : JSON.stringify(step);
        content += `${idx + 1}. ${text}\n`;
      });
      content += '\n';
    }
    
    if (Array.isArray(syn.risks) && syn.risks.length > 0) {
      content += `## Risks\n\n`;
      syn.risks.forEach((risk: any) => {
        const text = typeof risk === 'string' ? risk : JSON.stringify(risk);
        content += `- ${text}\n`;
      });
      content += '\n';
    }
    
    if (syn.confidence) {
      content += `## Confidence Level\n\n${syn.confidence}\n\n`;
    }
    
    if (syn.appendix && typeof syn.appendix === 'object') {
      content += `## Appendix\n\n`;
      const app = syn.appendix;
      
      if (Array.isArray(app.surfaceHighlights) && app.surfaceHighlights.length > 0) {
        content += `### Surface Research Highlights\n\n`;
        app.surfaceHighlights.forEach((item: any) => {
          const text = typeof item === 'string' ? item : JSON.stringify(item);
          content += `- ${text}\n`;
        });
        content += '\n';
      }
      
      if (Array.isArray(app.deepHighlights) && app.deepHighlights.length > 0) {
        content += `### Deep Research Highlights\n\n`;
        app.deepHighlights.forEach((item: any) => {
          const text = typeof item === 'string' ? item : JSON.stringify(item);
          content += `- ${text}\n`;
        });
        content += '\n';
      }
      
      if (Array.isArray(app.dialogueConsensus) && app.dialogueConsensus.length > 0) {
        content += `### Dialogue Consensus\n\n`;
        app.dialogueConsensus.forEach((item: any) => {
          const text = typeof item === 'string' ? item : JSON.stringify(item);
          content += `- ${text}\n`;
        });
        content += '\n';
      }
      
      if (Array.isArray(app.openQuestions) && app.openQuestions.length > 0) {
        content += `### Open Questions\n\n`;
        app.openQuestions.forEach((item: any) => {
          const text = typeof item === 'string' ? item : JSON.stringify(item);
          content += `- ${text}\n`;
        });
        content += '\n';
      }
      
      if (app.confidenceRationale) {
        content += `### Confidence Rationale\n\n${app.confidenceRationale}\n\n`;
      }
    }
    
    return content.trim() || syn.executiveSummary || '';
  };

  const synthesisData = formatSynthesisForDisplay(synthesis);

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
            <div className="prose prose-emerald max-w-none">
              <ReactMarkdown 
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold text-emerald-900 mb-4 mt-6 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-semibold text-emerald-800 mb-3 mt-5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold text-emerald-800 mb-2 mt-4">{children}</h3>,
                  p: ({ children }) => <p className="text-emerald-800 leading-relaxed mb-3">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside text-emerald-800 mb-3 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside text-emerald-800 mb-3 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-emerald-800">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-emerald-900">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-emerald-300 pl-4 italic text-emerald-700 my-4">{children}</blockquote>,
                  code: ({ children }) => <code className="bg-emerald-100 px-1.5 py-0.5 rounded text-sm font-mono text-emerald-900">{children}</code>,
                  pre: ({ children }) => <pre className="bg-emerald-50 p-4 rounded-lg overflow-x-auto mb-3">{children}</pre>,
                }}
              >
                {synthesisData}
              </ReactMarkdown>
            </div>
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
          <div className="prose prose-sm prose-blue max-w-none" data-testid="text-executive-summary">
            <ReactMarkdown 
              components={{
                h1: ({ children }) => <h1 className="text-lg font-bold text-blue-900 mb-3 mt-4 first:mt-0">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold text-blue-800 mb-2 mt-3">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold text-blue-800 mb-1.5 mt-2">{children}</h3>,
                p: ({ children }) => <p className="text-sm text-blue-800 mb-2">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside text-sm text-blue-800 mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-blue-800 mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="text-sm text-blue-800">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-blue-900">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                blockquote: ({ children }) => <blockquote className="border-l-3 border-blue-300 pl-3 italic text-blue-700 my-2">{children}</blockquote>,
                code: ({ children }) => <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono text-blue-900">{children}</code>,
                pre: ({ children }) => <pre className="bg-blue-50 p-3 rounded overflow-x-auto mb-2 text-xs">{children}</pre>,
              }}
            >
              {synthesisData}
            </ReactMarkdown>
          </div>
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
