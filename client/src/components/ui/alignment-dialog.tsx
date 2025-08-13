import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, MessageSquare, Target } from "lucide-react";

interface AlignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: string;
  driftAreas?: string[];
  onAnswer: (answer: string) => void;
}

export function AlignmentDialog({
  open,
  onOpenChange,
  question,
  driftAreas = [],
  onAnswer,
}: AlignmentDialogProps) {
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!answer.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onAnswer(answer);
      setAnswer("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <Target className="w-5 h-5 text-amber-600" />
            </div>
            <DialogTitle className="text-xl font-semibold">
              Research Alignment Check
            </DialogTitle>
          </div>
          <DialogDescription className="text-base mt-3">
            Your guidance is needed to ensure the agents are exploring the most valuable aspects of your research question.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Drift Areas if provided */}
          {driftAreas.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">Areas needing clarification:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {driftAreas.map((area, idx) => (
                      <li key={idx}>{area}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* The Question with Markdown support */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <MessageSquare className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 prose prose-sm prose-blue max-w-none">
                {question.split('\n').map((line, idx) => {
                  // Handle markdown-style formatting
                  if (line.match(/^#{1,3}\s/)) {
                    // Headers
                    const level = line.match(/^#+/)?.[0].length || 1;
                    const text = line.replace(/^#+\s/, '');
                    const className = level === 1 ? "text-lg font-bold text-blue-900 mb-2" : 
                                    level === 2 ? "text-base font-semibold text-blue-800 mb-1" : 
                                    "text-sm font-medium text-blue-700";
                    return <p key={idx} className={className}>{text}</p>;
                  } else if (line.match(/^\*\*.*\*\*$/)) {
                    // Bold text
                    const text = line.replace(/\*\*/g, '');
                    return <p key={idx} className="font-semibold text-blue-900 mb-1">{text}</p>;
                  } else if (line.startsWith('**') && line.includes(':**')) {
                    // Bold label with colon
                    const [label, ...rest] = line.split(':**');
                    const labelText = label.replace(/\*\*/g, '');
                    const content = rest.join(':**');
                    return (
                      <p key={idx} className="text-sm text-gray-700 mb-1">
                        <span className="font-semibold text-blue-900">{labelText}:</span> {content}
                      </p>
                    );
                  } else if (line.startsWith('•') || line.startsWith('-')) {
                    // Bullet points
                    return (
                      <li key={idx} className="text-sm text-gray-700 ml-2 list-disc">
                        {line.substring(1).trim()}
                      </li>
                    );
                  } else if (line.match(/^\d\.\s/)) {
                    // Numbered lists
                    return (
                      <li key={idx} className="text-sm text-gray-700 ml-2 list-decimal">
                        {line.replace(/^\d\.\s/, '')}
                      </li>
                    );
                  } else if (line.trim() === '') {
                    // Empty lines for spacing
                    return <div key={idx} className="h-2" />;
                  } else if (line.startsWith('🔄') || line.startsWith('🎯')) {
                    // Emoji headers
                    return <p key={idx} className="text-base font-semibold text-blue-900 mb-2">{line}</p>;
                  } else {
                    // Regular text
                    return <p key={idx} className="text-sm text-gray-700 leading-relaxed">{line}</p>;
                  }
                })}
              </div>
            </div>
          </div>

          {/* Answer Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-500" />
              Your guidance for the agents:
            </label>
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Describe what specific aspects you'd like the agents to focus on, what to explore more deeply, or what to avoid. Be as specific as possible to help guide the research effectively..."
              className="min-h-[120px] resize-none"
              autoFocus
            />
            <p className="text-xs text-gray-500">
              Your response will directly shape the next rounds of dialogue, helping agents focus on what matters most to you.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!answer.trim() || isSubmitting}
              className="bg-primary hover:bg-primary-dark"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Submitting...
                </>
              ) : (
                "Submit Answer"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
