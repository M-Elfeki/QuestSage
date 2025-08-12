interface ResearchFindingsProps {
  progress: number;
  className?: string;
}

const mockFindings = [
  {
    type: "high-confidence",
    title: "High-Confidence Finding",
    description: "Studies show 15-30% productivity gains in coding and writing tasks",
    color: "green"
  },
  {
    type: "mixed-evidence", 
    title: "Mixed Evidence",
    description: "Contradictory predictions on net job creation vs displacement",
    color: "yellow"
  },
  {
    type: "research-gap",
    title: "Research Gap", 
    description: "Limited long-term data on wage effects in knowledge sectors",
    color: "blue"
  }
];

export default function ResearchFindings({ progress, className }: ResearchFindingsProps) {
  return (
    <div className={`bg-surface rounded-xl shadow-sm border border-gray-200 p-6 ${className || ''}`}>
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
        <i className="fas fa-chart-line text-accent mr-2"></i>
        Key Findings Preview
      </h3>
      <div className="space-y-4">
        {mockFindings.map((finding, index) => (
          <div key={finding.type} className={`p-3 rounded-lg border ${
            finding.color === "green" ? "bg-green-50 border-green-200" :
            finding.color === "yellow" ? "bg-yellow-50 border-yellow-200" :
            "bg-blue-50 border-blue-200"
          }`}>
            <div className="flex items-start space-x-2">
              <i className={`mt-0.5 ${
                finding.color === "green" ? "fas fa-check-circle text-green-500" :
                finding.color === "yellow" ? "fas fa-exclamation-triangle text-yellow-500" :
                "fas fa-info-circle text-blue-500"
              }`}></i>
              <div>
                <p className={`text-sm font-medium ${
                  finding.color === "green" ? "text-green-800" :
                  finding.color === "yellow" ? "text-yellow-800" :
                  "text-blue-800"
                }`} data-testid={`finding-title-${index}`}>
                  {finding.title}
                </p>
                <p className={`text-xs mt-1 ${
                  finding.color === "green" ? "text-green-700" :
                  finding.color === "yellow" ? "text-yellow-700" :
                  "text-blue-700"
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
