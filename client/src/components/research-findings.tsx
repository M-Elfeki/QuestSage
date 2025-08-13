interface ResearchFindingsProps {
  progress: number;
  researchData?: any;
  className?: string;
}

const generateDynamicFindings = (researchData?: any) => {
  if (!researchData) {
    return [
      {
        type: "awaiting-data",
        title: "Awaiting Research Data",
        description: "Key findings will appear here once research is complete",
        color: "gray"
      }
    ];
  }

  const findings = [];
  
  // High confidence findings
  const highConfidenceClaims = researchData.factExtraction?.claims?.filter((f: any) => 
    f.relevanceScore > 80 || f.qualityScore > 80
  ) || [];
  
  if (highConfidenceClaims.length > 0) {
    findings.push({
      type: "high-confidence",
      title: "High-Confidence Finding",
      description: `${highConfidenceClaims.length} facts with high relevance/quality scores found`,
      color: "green"
    });
  }

  // Mixed evidence findings 
  const contradictoryClaims = researchData.factExtraction?.claims?.filter((f: any) => 
    f.isContradictory === true
  ) || researchData.analysis?.contradictions || [];
  
  if (contradictoryClaims.length > 0) {
    findings.push({
      type: "mixed-evidence",
      title: "Mixed Evidence",
      description: `${contradictoryClaims.length} contradictory findings require further analysis`,
      color: "yellow"
    });
  }

  // Research gaps
  const totalSources = (researchData.searchResults?.web?.results?.length || 0) + 
                      (researchData.searchResults?.arxiv?.results?.length || 0) + 
                      (researchData.searchResults?.reddit?.results?.length || 0);
  
  const totalClaims = researchData.factExtraction?.claims?.length || researchData.factExtraction?.totalClaims || 0;
  
  if (totalSources > 0 && totalClaims < totalSources * 0.5) {
    findings.push({
      type: "research-gap",
      title: "Research Gap",
      description: `Limited fact extraction from ${totalSources} sources - may need deeper analysis`,
      color: "blue"
    });
  }

  // If no specific findings, show summary
  if (findings.length === 0 && totalSources > 0) {
    findings.push({
      type: "summary",
      title: "Research Complete",
      description: `Analyzed ${totalSources} sources and extracted ${totalClaims} facts`,
      color: "green"
    });
  }

  return findings;
};

export default function ResearchFindings({ progress, researchData, className }: ResearchFindingsProps) {
  const dynamicFindings = generateDynamicFindings(researchData);
  return (
    <div className={`bg-surface rounded-xl shadow-sm border border-gray-200 p-6 ${className || ''}`}>
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
        <i className="fas fa-chart-line text-accent mr-2"></i>
        Key Findings Preview
      </h3>
      <div className="space-y-4">
        {dynamicFindings.map((finding, index) => (
          <div key={finding.type} className={`p-3 rounded-lg border ${
            finding.color === "green" ? "bg-green-50 border-green-200" :
            finding.color === "yellow" ? "bg-yellow-50 border-yellow-200" :
            finding.color === "blue" ? "bg-blue-50 border-blue-200" :
            "bg-gray-50 border-gray-200"
          }`}>
            <div className="flex items-start space-x-2">
              <i className={`mt-0.5 ${
                finding.color === "green" ? "fas fa-check-circle text-green-500" :
                finding.color === "yellow" ? "fas fa-exclamation-triangle text-yellow-500" :
                finding.color === "blue" ? "fas fa-info-circle text-blue-500" :
                "fas fa-clock text-gray-500"
              }`}></i>
              <div>
                <p className={`text-sm font-medium ${
                  finding.color === "green" ? "text-green-800" :
                  finding.color === "yellow" ? "text-yellow-800" :
                  finding.color === "blue" ? "text-blue-800" :
                  "text-gray-800"
                }`} data-testid={`finding-title-${index}`}>
                  {finding.title}
                </p>
                <p className={`text-xs mt-1 ${
                  finding.color === "green" ? "text-green-700" :
                  finding.color === "yellow" ? "text-yellow-700" :
                  finding.color === "blue" ? "text-blue-700" :
                  "text-gray-700"
                }`} data-testid={`finding-description-${index}`}>
                  {finding.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2" data-testid="text-research-progress">Research Progress</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300" 
              style={{width: `${progress}%`}}
              data-testid="progress-research-bar"
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-1" data-testid="text-progress-percentage">{progress}% Complete</p>
        </div>
      </div>
    </div>
  );
}
