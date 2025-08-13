interface SourceMetricsProps {
  researchData?: any;
  className?: string;
}

const generateDynamicMetrics = (researchData?: any) => {
  if (!researchData) {
    return [
      { type: "Peer-Reviewed", percentage: 0, count: 0, color: "green" },
      { type: "Primary Sources", percentage: 0, count: 0, color: "blue" },
      { type: "Recent (2023-2024)", percentage: 0, count: 0, color: "purple" }
    ];
  }

  const webResults = researchData.searchResults?.web?.results || [];
  const arxivResults = researchData.searchResults?.arxiv?.results || [];
  const redditResults = researchData.searchResults?.reddit?.results || [];
  
  const totalSources = webResults.length + arxivResults.length + redditResults.length;
  
  if (totalSources === 0) {
    return [
      { type: "Peer-Reviewed", percentage: 0, count: 0, color: "green" },
      { type: "Primary Sources", percentage: 0, count: 0, color: "blue" },
      { type: "Recent (2023-2024)", percentage: 0, count: 0, color: "purple" }
    ];
  }

  // arXiv papers are considered peer-reviewed academic sources
  const peerReviewedCount = arxivResults.length;
  const peerReviewedPercentage = Math.round((peerReviewedCount / totalSources) * 100);

  // Web and arXiv sources are considered primary sources
  const primarySourcesCount = webResults.length + arxivResults.length;
  const primarySourcesPercentage = Math.round((primarySourcesCount / totalSources) * 100);

  // Estimate recent sources (assuming most collected data is recent)
  const recentCount = totalSources; // Most web results are recent
  const recentPercentage = Math.round((recentCount / totalSources) * 100);

  return [
    { type: "Academic Sources", percentage: peerReviewedPercentage, count: peerReviewedCount, color: "green" },
    { type: "Primary Sources", percentage: primarySourcesPercentage, count: primarySourcesCount, color: "blue" },
    { type: "Total Sources", percentage: 100, count: totalSources, color: "purple" }
  ];
};

export default function SourceMetrics({ researchData, className }: SourceMetricsProps) {
  const dynamicMetrics = generateDynamicMetrics(researchData);
  return (
    <div className={`bg-surface rounded-xl shadow-sm border border-gray-200 p-6 ${className || ''}`}>
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
        <i className="fas fa-shield-alt text-primary mr-2"></i>
        Source Quality
      </h3>
      <div className="space-y-3">
        {dynamicMetrics.map((metric, index) => (
          <div key={metric.type} className="flex justify-between items-center">
            <span className="text-sm text-gray-600" data-testid={`metric-label-${index}`}>{metric.type}</span>
            <div className="text-right">
              <div className={`text-sm font-semibold ${
                metric.color === "green" ? "text-green-600" :
                metric.color === "blue" ? "text-blue-600" :
                "text-purple-600"
              }`} data-testid={`metric-percentage-${index}`}>
                {metric.percentage}%
              </div>
              <div className="text-xs text-gray-500" data-testid={`metric-count-${index}`}>
                {metric.count} sources
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
