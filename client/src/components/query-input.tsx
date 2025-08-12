import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface QueryInputProps {
  onQuerySubmit: (query: string) => void;
}

export default function QueryInput({ onQuerySubmit }: QueryInputProps) {
  const [query, setQuery] = useState("What are the potential implications of widespread adoption of large language models on the future job market, particularly in knowledge work sectors?");

  const handleSubmit = () => {
    if (query.trim()) {
      onQuerySubmit(query);
    }
  };

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <i className="fas fa-edit text-primary mr-2"></i>
        Research Query
      </h2>
      <div className="space-y-4">
        <Textarea
          className="w-full p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[100px]"
          placeholder="Enter your complex research question here. For example: 'What are the key factors that will determine the adoption rate of quantum computing in financial services over the next 5 years?'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="input-research-query"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <i className="fas fa-info-circle"></i>
            <span data-testid="text-query-hint">Optimal for complex, ambiguous problems requiring multi-perspective analysis</span>
          </div>
          <Button 
            onClick={handleSubmit}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium"
            data-testid="button-start-research"
          >
            <i className="fas fa-rocket mr-2"></i>
            Start Research
          </Button>
        </div>
      </div>
    </div>
  );
}
