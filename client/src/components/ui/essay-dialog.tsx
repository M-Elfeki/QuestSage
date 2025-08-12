import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';

interface EssayDialogProps {
  sessionId: string;
  researchData: any;
  onEssayGenerated?: (essay: string) => void;
}

export function EssayDialog({ sessionId, researchData, onEssayGenerated }: EssayDialogProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [essay, setEssay] = useState('');

  const generateEssay = useMutation({
    mutationFn: async (data: { sessionId: string; question: string; researchData: any }) => {
      const response = await fetch('/api/generate-essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: (data) => {
      setEssay(data.essay);
      onEssayGenerated?.(data.essay);
    }
  });

  const handleGenerate = () => {
    if (question.trim()) {
      generateEssay.mutate({ sessionId, question: question.trim(), researchData });
    }
  };

  const handleReset = () => {
    setQuestion('');
    setEssay('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline"
          data-testid="button-generate-essay"
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Generate Essay
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle data-testid="title-essay-generator">Essay Generator</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!essay ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="question">Follow-up Question</Label>
                <Input
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What specific aspect would you like me to explore in detail?"
                  data-testid="input-essay-question"
                />
              </div>
              
              <p className="text-sm text-muted-foreground">
                Based on the research findings, I'll generate a comprehensive essay addressing your question.
                The essay will include structured arguments, evidence from the research, and well-supported conclusions.
              </p>

              <div className="flex gap-2">
                <Button 
                  onClick={handleGenerate}
                  disabled={!question.trim() || generateEssay.isPending}
                  data-testid="button-start-essay"
                  className="gap-2"
                >
                  {generateEssay.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Generate Essay
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setOpen(false)}
                  data-testid="button-cancel-essay"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium" data-testid="text-essay-question">
                  Question: "{question}"
                </h3>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleReset}
                  data-testid="button-new-essay"
                >
                  New Essay
                </Button>
              </div>

              <ScrollArea className="h-[60vh] border rounded-lg p-4">
                <div 
                  className="prose prose-sm max-w-none dark:prose-invert"
                  data-testid="content-essay"
                >
                  <ReactMarkdown>{essay}</ReactMarkdown>
                </div>
              </ScrollArea>

              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(essay)}
                  data-testid="button-copy-essay"
                >
                  Copy Essay
                </Button>
                <Button 
                  onClick={() => setOpen(false)}
                  data-testid="button-close-essay"
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}