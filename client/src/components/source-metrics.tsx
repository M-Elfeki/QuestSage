interface SourceMetricsProps {
  className?: string;
}

const mockMetrics = [
  { type: "Peer-Reviewed", percentage: 67, count: 156, color: "green" },
  { type: "Primary Sources", percentage: 23, count: 54, color: "blue" },
  { type: "Recent (2023-2024)", percentage: 78, count: 183, color: "purple" }
];

export default function SourceMetrics({ className }: SourceMetricsProps) {
  return (
    <div className={`bg-surface rounded-xl shadow-sm border border-gray-200 p-6 ${className || ''}`}>
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
        <i className="fas fa-shield-alt text-primary mr-2"></i>
        Source Quality
      </h3>
      <div className="space-y-3">
        {mockMetrics.map((metric, index) => (
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
