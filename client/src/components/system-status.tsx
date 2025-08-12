interface SystemStatusProps {
  className?: string;
}

const systemComponents = [
  { name: "Flash LLM", status: "active", color: "success" },
  { name: "Pro LLM", status: "ready", color: "success" },
  { name: "Research APIs", status: "processing", color: "primary" },
  { name: "Agent Providers", status: "standby", color: "warning" }
];

export default function SystemStatus({ className }: SystemStatusProps) {
  return (
    <div className={`bg-surface rounded-xl shadow-sm border border-gray-200 p-6 ${className || ''}`}>
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
        <i className="fas fa-tachometer-alt text-primary mr-2"></i>
        System Status
      </h3>
      <div className="space-y-4">
        {systemComponents.map((component) => (
          <div key={component.name} className="flex items-center justify-between">
            <span className="text-sm text-gray-600" data-testid={`component-${component.name.replace(/\s+/g, '-').toLowerCase()}`}>
              {component.name}
            </span>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                component.color === "success" ? "bg-success" :
                component.color === "primary" ? "bg-primary animate-pulse" :
                component.color === "warning" ? "bg-warning" : "bg-gray-400"
              }`}></div>
              <span className={`text-xs font-medium ${
                component.color === "success" ? "text-success" :
                component.color === "primary" ? "text-primary" :
                component.color === "warning" ? "text-warning" : "text-gray-500"
              }`} data-testid={`status-${component.name.replace(/\s+/g, '-').toLowerCase()}`}>
                {component.status.charAt(0).toUpperCase() + component.status.slice(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
