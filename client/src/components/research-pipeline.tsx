import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ResearchPipelineProps {
  sessionId: string | null;
  onComplete: (data: any) => void;
  onProgress: (progress: number) => void;
}

export default function ResearchPipeline({ sessionId, onComplete, onProgress }: ResearchPipelineProps) {
  const [currentPhase, setCurrentPhase] = useState<"surface" | "analysis" | "deep" | "complete">("surface");
  const [researchData, setResearchData] = useState<any>(null);

  const startResearchMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/start-research", data).then(res => res.json()),
    onSuccess: (data) => {
      setResearchData(data);
      setCurrentPhase("analysis");
      onProgress(60);
      // Simulate analysis completion
      setTimeout(() => {
        setCurrentPhase("deep");
        onProgress(75);
      }, 2000);
    }
  });

  const deepResearchMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("POST", "/api/deep-research", data).then(res => res.json()),
    onSuccess: (deepData) => {
      setCurrentPhase("complete");
      onProgress(100);
      setTimeout(() => {
        onComplete({ ...researchData, deepResearch: deepData });
      }, 1000);
    }
  });

  useEffect(() => {
    if (sessionId && currentPhase === "surface") {
      startResearchMutation.mutate({
        sessionId: sessionId || "demo-session",
        clarifiedIntent: { 
          scope: "LLM impact analysis",
          requirements: ["productivity analysis", "timeline predictions"]
        }
      });
    }
  }, [sessionId, currentPhase]);

  useEffect(() => {
    if (currentPhase === "deep" && researchData) {
      deepResearchMutation.mutate({
        sessionId: sessionId || "demo-session",
        analysis: researchData.analysis
      });
    }
  }, [currentPhase, researchData]);

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <i className="fas fa-search-plus text-primary mr-2"></i>
          Multi-Tier Research Pipeline
        </h2>
        <div className="text-sm text-gray-500" data-testid="text-phase-indicator">Phase 2 of 5</div>
      </div>

      <div className="space-y-6">
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
          {researchData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Google Search:</span>
                  <span className="font-medium text-green-600" data-testid="count-google-articles">
                    {researchData.searchResults.google?.results?.length || 0} articles
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>arXiv Papers:</span>
                  <span className="font-medium text-green-600" data-testid="count-arxiv-papers">
                    {researchData.searchResults.arxiv?.results?.length || 0} papers
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
                  <span>Social Insights:</span>
                  <span className="font-medium text-green-600" data-testid="count-social-insights">
                    {(researchData.searchResults.reddit?.results?.length || 0)} insights
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
                  {researchData.factExtraction.keyFacts?.length || 0} facts
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{width: "100%"}}></div>
              </div>
              {researchData.factExtraction && (
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-green-600" data-testid="count-high-confidence">
                      {researchData.factExtraction.keyFacts?.filter((f: any) => f.confidence > 0.8).length || 0}
                    </div>
                    <div className="text-gray-500">High Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-yellow-600" data-testid="count-medium-confidence">
                      {researchData.factExtraction.keyFacts?.filter((f: any) => f.confidence > 0.6 && f.confidence <= 0.8).length || 0}
                    </div>
                    <div className="text-gray-500">Medium Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-red-500" data-testid="count-contradictions">
                      {researchData.factExtraction.contradictions?.length || 0}
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
            <strong>Deep Research Query:</strong> "Investigate contradictory claims about LLM impact on creative and analytical roles. Focus on empirical studies of productivity changes, wage effects, and skill complementarity vs substitution patterns in early adopter organizations."
          </div>
        </div>
      </div>
    </div>
  );
}
