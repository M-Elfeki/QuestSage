import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";

interface ResearchPipelineProps {
  sessionId: string | null;
  clarifiedIntent?: any;
  status?: 'pending' | 'active' | 'completed';
  onComplete: (data: any) => void;
  onProgress: (progress: number) => void;
}

export default function ResearchPipeline({ sessionId, clarifiedIntent, status = 'active', onComplete, onProgress }: ResearchPipelineProps) {
  const [currentPhase, setCurrentPhase] = useState<"surface" | "analysis" | "deep" | "complete">("surface");
  const [researchData, setResearchData] = useState<any>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [hasCompleted, setHasCompleted] = useState<boolean>(false);
  const [searchProgress, setSearchProgress] = useState<{
    step: string;
    current: number;
    total: number;
    item: string;
    overall: number;
  }>({
    step: "Initializing",
    current: 0,
    total: 100,
    item: "Getting ready...",
    overall: 0
  });

  const startResearchMutation = useMutation({
    mutationFn: async (data: any) => {
      // Set initial progress state
      setSearchProgress({
        step: "Initializing Research",
        current: 1,
        total: 4,
        item: "Generating search terms and planning research...",
        overall: 10
      });
      onProgress(10);

      // Start the actual API call
      setSearchProgress({
        step: "Executing Multi-Tier Search",
        current: 2,
        total: 4,
        item: "Running parallel searches across Web, arXiv, and Reddit...",
        overall: 25
      });
      onProgress(25);

      const result = await apiRequest("POST", "/api/start-research", data).then(res => res.json());

      // API call completed, now processing results
      setSearchProgress({
        step: "Processing Results",
        current: 3,
        total: 4,
        item: "Extracting facts and analyzing findings...",
        overall: 75
      });
      onProgress(75);

      return result;
    },
    onSuccess: (data) => {
      setSearchProgress({
        step: "Surface Research Complete",
        current: 4,
        total: 4,
        item: "Surface-level research and analysis completed",
        overall: 100
      });
      setResearchData(data);
      setCurrentPhase("analysis");
      onProgress(100);
      // Move to deep research phase immediately
      setCurrentPhase("deep");
      onProgress(75);
    }
  });

  const deepResearchMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/deep-research", data).then(res => res.json()),
    onSuccess: (deepData) => {
      setCurrentPhase("complete");
      setHasCompleted(true);
      setIsCollapsed(true); // Auto-collapse after completion
      onProgress(100);
      setTimeout(() => {
        onComplete({ ...researchData, deepResearch: deepData });
      }, 1000);
    }
  });

  useEffect(() => {
    if (sessionId && currentPhase === "surface") {
      startResearchMutation.mutate({
        sessionId: sessionId,
        clarifiedIntent: clarifiedIntent || { 
          scope: "Analysis of the impact and timeline of large language model adoption on knowledge work sectors",
          requirements: [
            "Analysis of LLM impact on knowledge work productivity",
            "Timeline predictions for widespread adoption",
            "Sector-specific vulnerability assessment", 
            "Economic implications and workforce displacement risks",
            "Policy recommendations for adaptation strategies"
          ]
        }
      });
    }
  }, [sessionId, currentPhase, clarifiedIntent]);

  useEffect(() => {
    if (currentPhase === "deep" && researchData) {
      deepResearchMutation.mutate({
        sessionId: sessionId,
        analysis: researchData.analysis
      });
    }
  }, [currentPhase, researchData, sessionId]);

  // Set initial collapsed state based on status
  useEffect(() => {
    if (status === 'completed') {
      setIsCollapsed(true);
      setHasCompleted(true);
    }
  }, [status]);

  const containerClasses = status === 'completed' 
    ? "bg-green-50 rounded-xl shadow-sm border border-green-200 p-6"
    : "bg-surface rounded-xl shadow-sm border border-gray-200 p-6";

  const headerIconColor = status === 'completed' ? "text-green-600" : "text-primary";
  const headerTextColor = status === 'completed' ? "text-green-900" : "text-gray-900";

  return (
    <div className={containerClasses}>
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-lg font-semibold ${headerTextColor} flex items-center`}>
          <i className={`fas ${status === 'completed' ? 'fa-check-circle' : 'fa-search-plus'} ${headerIconColor} mr-2`}></i>
          Multi-Tier Research Pipeline
          {status === 'completed' && (
            <span className="ml-2 text-sm text-green-600 font-medium">
              ✓ Completed
            </span>
          )}
        </h2>
        <div className="flex items-center space-x-3">
          {(hasCompleted || status === 'completed') && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
              data-testid="toggle-research-details"
            >
              <i className={`fas ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
              <span>{isCollapsed ? 'Show Details' : 'Hide Details'}</span>
            </button>
          )}
          <div className={`text-sm ${status === 'completed' ? 'text-green-600' : 'text-gray-500'} font-medium`} data-testid="text-phase-indicator">
            Phase 2 of 5 {status === 'completed' ? '✓' : ''}
          </div>
          <div className={`text-xs px-2 py-1 rounded-full bg-green-100 text-green-800`}>
            Production Mode
          </div>
        </div>
      </div>

      {/* Collapsed Summary View */}
      {isCollapsed && hasCompleted && researchData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-lg font-semibold text-green-600" data-testid="summary-total-sources">
                {(researchData.searchResults.web?.results?.length || 0) + 
                 (researchData.searchResults.arxiv?.results?.length || 0) + 
                 (researchData.searchResults.reddit?.results?.length || 0)}
              </div>
              <div className="text-gray-600 text-xs">Total Sources</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-lg font-semibold text-blue-600" data-testid="summary-extracted-facts">
                {researchData.factExtraction?.claims?.length || researchData.factExtraction?.totalClaims || 0}
              </div>
              <div className="text-gray-600 text-xs">Facts Extracted</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-lg font-semibold text-orange-600" data-testid="summary-high-confidence">
                {researchData.factExtraction?.claims?.filter((f: any) => f.relevanceScore > 80 || f.qualityScore > 80).length || 0}
              </div>
              <div className="text-gray-600 text-xs">High Confidence</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-lg font-semibold text-red-600" data-testid="summary-contradictions">
                {researchData.factExtraction?.claims?.filter((f: any) => f.isContradictory === true).length || researchData.analysis?.contradictions?.length || 0}
              </div>
              <div className="text-gray-600 text-xs">Contradictions</div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed View */}
      {!isCollapsed && (
        <div className="space-y-6">
          {/* Additional Comments Display */}
          {clarifiedIntent?.additionalComments && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-medium text-green-900 mb-2 flex items-center">
                <i className="fas fa-comment text-green-600 mr-2"></i>
                Additional Context
              </h3>
              <p className="text-sm text-green-800 italic">
                "{clarifiedIntent.additionalComments}"
              </p>
            </div>
          )}

        {/* Surface Level Research */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900 flex items-center">
              <i className="fas fa-globe text-green-500 mr-2"></i>
              Surface-Level Research
            </h3>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                currentPhase === "surface" ? "bg-primary animate-pulse" : "bg-green-500"
              }`}></div>
              <span className={`text-xs font-medium ${
                currentPhase === "surface" ? "text-primary" : "text-green-600"
              }`} data-testid="status-surface-research">
                {currentPhase === "surface" ? "Processing..." : "Completed"}
              </span>
            </div>
          </div>

          {/* Enhanced Progress Tracking */}
          {currentPhase === "surface" && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-blue-900">
                  {searchProgress.step}
                </div>
                <div className="text-xs text-blue-600">
                  {searchProgress.current}/{searchProgress.total}
                </div>
              </div>
              <Progress 
                value={(searchProgress.current / searchProgress.total) * 100} 
                className="h-2 mb-2" 
              />
              <div className="text-xs text-blue-700 truncate">
                {searchProgress.item}
              </div>
              <div className="mt-2 text-xs text-blue-600">
                Overall Progress: {searchProgress.overall}%
              </div>
            </div>
          )}
          {researchData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Web Search Results:</span>
                  <span className="font-medium text-green-600" data-testid="count-web-articles">
                    {researchData.searchResults.web?.results?.length || 0} articles
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>arXiv Papers:</span>
                  <span className="font-medium text-green-600" data-testid="count-arxiv-papers">
                    {researchData.searchResults.arxiv?.results?.length || 0} papers
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total Surface Sources:</span>
                  <span className="font-medium text-blue-600" data-testid="count-total-surface">
                    {(researchData.searchResults.web?.results?.length || 0) + (researchData.searchResults.arxiv?.results?.length || 0)} sources
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Reddit Discussions:</span>
                  <span className="font-medium text-green-600" data-testid="count-reddit-posts">
                    {researchData.searchResults.reddit?.results?.length || 0} posts
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Community Insights:</span>
                  <span className="font-medium text-green-600" data-testid="count-social-insights">
                    {(researchData.searchResults.reddit?.results?.length || 0)} insights
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total Results:</span>
                  <span className="font-medium text-purple-600" data-testid="count-total-all">
                    {(researchData.searchResults.web?.results?.length || 0) + 
                     (researchData.searchResults.arxiv?.results?.length || 0) + 
                     (researchData.searchResults.reddit?.results?.length || 0)} results
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fact Extraction */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900 flex items-center">
              <i className="fas fa-filter text-blue-500 mr-2"></i>
              Fact Extraction & Analysis
            </h3>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                currentPhase === "analysis" ? "bg-blue-500 animate-pulse" : 
                ["deep", "complete"].includes(currentPhase) ? "bg-green-500" : "bg-gray-400"
              }`}></div>
              <span className={`text-xs font-medium ${
                currentPhase === "analysis" ? "text-blue-600" : 
                ["deep", "complete"].includes(currentPhase) ? "text-green-600" : "text-gray-500"
              }`} data-testid="status-fact-extraction">
                {currentPhase === "analysis" ? "Processing..." : 
                 ["deep", "complete"].includes(currentPhase) ? "Completed" : "Queued"}
              </span>
            </div>
          </div>
          {researchData?.factExtraction && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Key Facts Extracted:</span>
                <span className="text-sm font-medium" data-testid="count-extracted-claims">
                  {researchData.factExtraction.claims?.length || researchData.factExtraction.totalClaims || 0} facts
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{width: "100%"}}></div>
              </div>
              {researchData.factExtraction && (
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-green-600" data-testid="count-high-confidence">
                      {researchData.factExtraction.claims?.filter((f: any) => f.relevanceScore > 80 || f.qualityScore > 80).length || 0}
                    </div>
                    <div className="text-gray-500">High Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-yellow-600" data-testid="count-medium-confidence">
                      {researchData.factExtraction.claims?.filter((f: any) => (f.relevanceScore > 60 && f.relevanceScore <= 80) || (f.qualityScore > 60 && f.qualityScore <= 80)).length || 0}
                    </div>
                    <div className="text-gray-500">Medium Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-red-500" data-testid="count-contradictions">
                      {researchData.factExtraction.claims?.filter((f: any) => f.isContradictory === true).length || researchData.analysis?.contradictions?.length || 0}
                    </div>
                    <div className="text-gray-500">Contradictions</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Deep Research */}
        <div className={`border rounded-lg p-4 ${
          currentPhase === "deep" ? "border-orange-200 bg-orange-50" : 
          currentPhase === "complete" ? "border-green-200 bg-green-50" : "border-gray-200"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900 flex items-center">
              <i className="fas fa-microscope text-orange-500 mr-2"></i>
              Deep Research (Perplexity Sonar)
            </h3>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                currentPhase === "deep" ? "bg-orange-500 animate-pulse" : 
                currentPhase === "complete" ? "bg-green-500" : "bg-gray-400"
              }`}></div>
              <span className={`text-xs font-medium ${
                currentPhase === "deep" ? "text-orange-600" : 
                currentPhase === "complete" ? "text-green-600" : "text-gray-500"
              }`} data-testid="status-deep-research">
                {currentPhase === "deep" ? "Processing..." : 
                 currentPhase === "complete" ? "Completed" : "Queued"}
              </span>
            </div>
          </div>
          <div className={`text-sm rounded p-3 ${
            currentPhase === "deep" ? "text-orange-700 bg-orange-100" :
            currentPhase === "complete" ? "text-green-700 bg-green-100" : "text-gray-700 bg-gray-100"
          }`}>
            <strong>Deep Research Query:</strong> {deepResearchMutation.isSuccess ? (`"${deepResearchMutation.data?.query || '...' }"`) : "Queued"}
          </div>
          {deepResearchMutation.isSuccess && deepResearchMutation.data?.deepResearchReport && (
            <div className="mt-3 p-3 bg-white border rounded">
              <div className="text-xs text-gray-700 font-medium mb-1">Deep Research Report Summary</div>
              <div className="text-xs text-gray-600">
                {(deepResearchMutation.data.deepResearchReport.keyFindings || []).slice(0,3).map((k: string, idx: number) => (
                  <div key={idx}>• {k}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Orchestration Plan */}
        {researchData?.orchestration && (
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900 flex items-center">
                <i className="fas fa-project-diagram text-indigo-500 mr-2"></i>
                Orchestration Plan
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-600 font-medium mb-1">Priorities</div>
                <ul className="list-disc list-inside text-gray-700">
                  {(researchData.orchestration.priorities || []).map((p: string, idx: number) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-gray-600 font-medium mb-1">Expected Findings</div>
                <ul className="list-disc list-inside text-gray-700">
                  {(researchData.orchestration.expectedFindings || []).map((e: string, idx: number) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-gray-600 font-medium mb-1">Time Allocation</div>
                <ul className="list-disc list-inside text-gray-700">
                  {researchData.orchestration.orchestrationPlan && Object.entries(researchData.orchestration.orchestrationPlan).map(([k, v]: any, idx: number) => (
                    <li key={idx}>{k}: {String(v)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
