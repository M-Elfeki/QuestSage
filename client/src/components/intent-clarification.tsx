import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";

interface IntentClarificationProps {
  onContinue: (sessionId: string, clarifiedIntent: any) => void;
  query?: string;
  status?: 'pending' | 'active' | 'completed';
  sessionId?: string | null;
}

export default function IntentClarification({ onContinue, query, status = 'active', sessionId }: IntentClarificationProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [additionalComments, setAdditionalComments] = useState<string>("");
  const [openTextAnswers, setOpenTextAnswers] = useState<Record<string, string>>({});
  
  const effectiveQuery = query && query.trim().length > 0 ? query.trim() : null;

  const { data: clarification, isLoading } = useQuery({
    queryKey: ["/api/clarify-intent", effectiveQuery, sessionId],
    queryFn: () => apiRequest("POST", "/api/clarify-intent", {
      query: effectiveQuery,
      sessionId: sessionId || undefined
    }).then(res => res.json()),
    enabled: !!effectiveQuery, // Only run query if we have an actual query
  });

  const createSessionMutation = useMutation({
    mutationFn: (data: any) => {
      // If sessionId already exists, use it; otherwise create new session
      if (sessionId) {
        return apiRequest("PUT", `/api/research-sessions/${sessionId}`, data).then(() => ({ id: sessionId }));
      }
      return apiRequest("POST", "/api/research-sessions", data).then(res => res.json());
    },
    onSuccess: (session) => {
      const intentData = {
        ...clarification,
        additionalComments: additionalComments.trim() || undefined
      };
      onContinue(session.id, intentData);
    }
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
    // Create a research session before continuing
    const sessionData = {
      query: effectiveQuery,
      status: "active",
      currentStage: "intentClarification",
      clarifiedIntent: {
        ...clarification,
        responses: selectedAnswers,
        openTextResponses: openTextAnswers,
        additionalComments: additionalComments.trim() || undefined
      },
      userId: null
    };
    
    createSessionMutation.mutate(sessionData);
  };

  // Show message when no query is provided
  if (!effectiveQuery) {
    return (
      <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <i className="fas fa-lightbulb text-accent mr-2"></i>
            Intent Clarification
          </h2>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <span className="text-sm text-gray-500 font-medium">Waiting</span>
          </div>
        </div>
        <div className="text-center py-8">
          <i className="fas fa-arrow-up text-4xl text-gray-300 mb-4"></i>
          <p className="text-gray-600 text-lg font-medium mb-2">Enter your research question above</p>
          <p className="text-gray-500 text-sm">
            Once you submit a research query, I'll analyze it and generate clarifying questions to help refine your research scope.
          </p>
        </div>
      </div>
    );
  }

  // Completed state view
  if (status === 'completed') {
    return (
      <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-green-900 flex items-center">
            <i className="fas fa-check-circle text-green-600 mr-2"></i>
            Intent Clarification Complete
          </h2>
          <div className="text-sm text-green-600 font-medium">Phase 1 of 5 ✓</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-green-900">Research Query:</div>
            <div className="text-sm text-green-800 bg-white p-3 rounded border border-green-200">
              "{effectiveQuery}"
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-green-900">Additional Context:</div>
            <div className="text-sm text-green-800 bg-white p-3 rounded border border-green-200">
              {additionalComments || "No additional context provided"}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
      
      <div className="space-y-6">
        <div className="p-5 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl shadow-sm">
          <h3 className="font-semibold text-indigo-900 mb-3 flex items-center">
            <i className="fas fa-check-circle text-indigo-600 mr-2"></i>
            Extracted Requirements
          </h3>
          <ul className="list-none space-y-2">
            {clarification.requirements.map((req: string, index: number) => (
              <li key={index} data-testid={`requirement-${index}`} className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-indigo-400 rounded-full mt-2 flex-shrink-0"></div>
                <span className="text-sm text-indigo-800 leading-relaxed">{req}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {clarification.questions && clarification.questions.length > 0 && (
          <div className="p-5 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl shadow-sm">
            <h3 className="font-semibold text-purple-900 mb-4 flex items-center">
              <i className="fas fa-question-circle text-purple-600 mr-2"></i>
              Clarifying Questions
            </h3>
            <div className="space-y-4">
              {clarification.questions.map((question: any, index: number) => (
                <div key={question.id} className="flex items-start space-x-3">
                  <div className="w-7 h-7 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-xs font-semibold mt-0.5 shadow-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-purple-800 font-medium leading-relaxed" data-testid={`question-${index}`}>{question.text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {question.options.map((option: string) => (
                        <button
                          key={option}
                          onClick={() => handleOptionSelect(question.id, option)}
                          className={`px-3 py-2 text-xs rounded-lg transition-all duration-200 font-medium ${
                            (selectedAnswers[question.id] || []).includes(option)
                              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md transform scale-105"
                              : "bg-white text-purple-700 border border-purple-200 hover:border-purple-300 hover:bg-purple-50 shadow-sm"
                          }`}
                          data-testid={`option-${question.id}-${option.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    {question.allowOpenText && (
                      <div className="mt-2">
                        <Textarea
                          placeholder="Add details or alternative answer..."
                          value={openTextAnswers[question.id] || ""}
                          onChange={(e) => setOpenTextAnswers({ ...openTextAnswers, [question.id]: e.target.value })}
                          className="min-h-[60px] resize-none text-xs"
                          data-testid={`open-text-${question.id}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Comments Section */}
        <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl shadow-sm">
          <h3 className="font-semibold text-emerald-900 mb-3 flex items-center">
            <i className="fas fa-plus-circle text-emerald-600 mr-2"></i>
            Additional Comments (Optional)
          </h3>
          <p className="text-sm text-emerald-700 mb-3 leading-relaxed">
            Add any additional context, specific areas of interest, or constraints that should be considered in the research.
          </p>
          <Textarea
            placeholder="e.g., Focus on the legal and healthcare sectors, consider regulatory implications, or add any other specific requirements..."
            value={additionalComments}
            onChange={(e) => setAdditionalComments(e.target.value)}
            className="min-h-[80px] resize-none border-emerald-200 focus:border-emerald-400 focus:ring-emerald-200"
            data-testid="additional-comments-textarea"
          />
        </div>

        <div className="flex justify-end space-x-4 pt-4">
          <Button
            variant="outline"
            onClick={handleContinue}
            data-testid="button-use-defaults"
            disabled={createSessionMutation.isPending}
            className="border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all duration-200"
          >
            {createSessionMutation.isPending ? (
              <span className="flex items-center">
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Creating Session...
              </span>
            ) : (
              "Use Default Settings"
            )}
          </Button>
          <Button
            onClick={handleContinue}
            data-testid="button-continue-selections"
            disabled={createSessionMutation.isPending}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-200"
          >
            {createSessionMutation.isPending ? (
              <span className="flex items-center">
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Creating Session...
              </span>
            ) : (
              <span className="flex items-center">
                <i className="fas fa-arrow-right mr-2"></i>
                Continue with Selections
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
