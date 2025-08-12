import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface IntentClarificationProps {
  onContinue: () => void;
}

export default function IntentClarification({ onContinue }: IntentClarificationProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  
  const { data: clarification, isLoading } = useQuery({
    queryKey: ["/api/clarify-intent"],
    queryFn: () => apiRequest("POST", "/api/clarify-intent", {
      query: "What are the potential implications of widespread adoption of large language models on the future job market, particularly in knowledge work sectors?"
    }).then(res => res.json()),
  });

  const handleOptionSelect = (questionId: string, option: string) => {
    const current = selectedAnswers[questionId] || [];
    const newAnswers = current.includes(option)
      ? current.filter(a => a !== option)
      : [...current, option];
    
    setSelectedAnswers({
      ...selectedAnswers,
      [questionId]: newAnswers
    });
  };

  const handleContinue = () => {
    onContinue();
  };

  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <i className="fas fa-lightbulb text-accent mr-2"></i>
            Intent Clarification
          </h2>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
            <span className="text-sm text-primary font-medium">Processing...</span>
          </div>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!clarification || !clarification.requirements) return null;

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <i className="fas fa-lightbulb text-accent mr-2"></i>
          Intent Clarification
        </h2>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-success rounded-full"></div>
          <span className="text-sm text-success font-medium" data-testid="status-intent-complete">Complete</span>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Extracted Requirements</h3>
          <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
            {clarification.requirements.map((req: string, index: number) => (
              <li key={index} data-testid={`requirement-${index}`}>{req}</li>
            ))}
          </ul>
        </div>
        
        {clarification.questions && clarification.questions.length > 0 && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h3 className="font-medium text-orange-900 mb-2">Clarifying Questions</h3>
            <div className="space-y-3">
              {clarification.questions.map((question: any, index: number) => (
                <div key={question.id} className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-xs font-medium mt-0.5">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-orange-800" data-testid={`question-${index}`}>{question.text}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {question.options.map((option: string) => (
                        <button
                          key={option}
                          onClick={() => handleOptionSelect(question.id, option)}
                          className={`px-3 py-1 text-xs rounded-full transition-colors ${
                            (selectedAnswers[question.id] || []).includes(option)
                              ? "bg-orange-200 text-orange-800"
                              : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                          }`}
                          data-testid={`option-${question.id}-${option.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <Button
            variant="outline"
            onClick={handleContinue}
            data-testid="button-use-defaults"
          >
            Use Default Settings
          </Button>
          <Button
            onClick={handleContinue}
            data-testid="button-continue-selections"
          >
            Continue with Selections
          </Button>
        </div>
      </div>
    </div>
  );
}
