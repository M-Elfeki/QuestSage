import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

interface ModelSelection {
  clarifyIntent: string;
  generateSearchTerms: string;
  orchestrateResearch: string;
  extractFactsFromWebResults: string;
  extractFactsFromRedditResults: string;
  extractFactsFromArxivResults: string;
  analyzeResearchFindings: string;
  generateSurfaceResearchReport: string;
  generateDeepResearchQuery: string;
  generateDeepResearchReport: string;
  selectAgents: string;
  checkAlignment: string;
  evaluateDialogueRound: string;
  synthesizeResults: string;
  chatgptAgentModel: string;
  geminiAgentModel: string;
}

interface ModelSelectionProps {
  sessionId: string | null;
  onComplete: (sessionId: string) => void;
}

interface ModelSelectionState extends ModelSelection {
  maxDialogueRounds?: number;
}

const STAGE_LABELS: Record<keyof ModelSelection, string> = {
  clarifyIntent: "Intent Clarification",
  generateSearchTerms: "Search Term Generation",
  orchestrateResearch: "Research Orchestration",
  extractFactsFromWebResults: "Web Fact Extraction",
  extractFactsFromRedditResults: "Reddit Fact Extraction",
  extractFactsFromArxivResults: "arXiv Fact Extraction",
  analyzeResearchFindings: "Research Analysis",
  generateSurfaceResearchReport: "Surface Research Report",
  generateDeepResearchQuery: "Deep Research Query",
  generateDeepResearchReport: "Deep Research Report",
  selectAgents: "Agent Selection",
  checkAlignment: "Alignment Check",
  evaluateDialogueRound: "Dialogue Evaluation",
  synthesizeResults: "Final Synthesis",
  chatgptAgentModel: "ChatGPT Debater Model",
  geminiAgentModel: "Gemini Debater Model",
};

export default function ModelSelection({ sessionId, onComplete }: ModelSelectionProps) {
  const queryClient = useQueryClient();
  const [localSelection, setLocalSelection] = useState<Partial<ModelSelection>>({});
  const [maxDialogueRounds, setMaxDialogueRounds] = useState<number>(3);
  const [isDirty, setIsDirty] = useState(false);

  // Fetch defaults and available models
  const { data: defaultsData, isLoading: defaultsLoading, error: defaultsError } = useQuery({
    queryKey: ["model-selection-defaults"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/model-selection/defaults`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        throw new Error(errorData.message || `Failed to fetch defaults: ${response.status}`);
      }
      const data = await response.json();
      console.log("📋 Received defaults data:", data);
      if (!data.defaults) {
        throw new Error("Response missing 'defaults' property");
      }
      return data;
    },
  });

  // Fetch current selection if sessionId exists
  const { data: currentData, isLoading: currentLoading } = useQuery({
    queryKey: ["model-selection", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const response = await fetch(`${API_BASE_URL}/api/model-selection/${sessionId}`);
      if (!response.ok) throw new Error("Failed to fetch selection");
      return response.json();
    },
    enabled: !!sessionId,
  });

  // Initialize local selection from defaults or current selection
  useEffect(() => {
    if (defaultsData?.defaults && Object.keys(localSelection).length === 0) {
      // Initialize with defaults if localSelection is empty
      setLocalSelection(defaultsData.defaults);
    }
    if (currentData?.selection && Object.keys(localSelection).length === 0) {
      // Initialize with current selection if available and localSelection is empty
      setLocalSelection(currentData.selection);
    }
  }, [defaultsData, currentData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/research-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelSelection: localSelection, maxDialogueRounds }),
      });
      if (!response.ok) throw new Error("Failed to create session");
      return response.json();
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (selection: Partial<ModelSelection>) => {
      let targetSessionId = sessionId;
      
      // Create session if it doesn't exist
      if (!targetSessionId) {
        const sessionResponse = await fetch(`${API_BASE_URL}/api/research-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelSelection: selection, maxDialogueRounds }),
        });
        if (!sessionResponse.ok) throw new Error("Failed to create session");
        const session = await sessionResponse.json();
        targetSessionId = session.id;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/model-selection/${targetSessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      if (!response.ok) throw new Error("Failed to save selection");
      const result = await response.json();
      
      // Also save maxDialogueRounds to session
      await fetch(`${API_BASE_URL}/api/research-sessions/${targetSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDialogueRounds }),
      });
      
      return { ...result, sessionId: targetSessionId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["model-selection"] });
      setIsDirty(false);
      // Pass the sessionId to onComplete callback
      onComplete(data.sessionId);
    },
  });

  const handleModelChange = (stage: keyof ModelSelection, model: string) => {
    setLocalSelection((prev) => ({ ...prev, [stage]: model }));
    setIsDirty(true);
  };

  const handleSave = () => {
    // Use defaults if localSelection is empty
    const selectionToSave = Object.keys(localSelection).length > 0 
      ? localSelection 
      : (defaultsData?.defaults || {});
    saveMutation.mutate(selectionToSave);
  };

  const handleUseDefaults = () => {
    if (defaultsData?.defaults) {
      setLocalSelection(defaultsData.defaults);
      setIsDirty(true);
    }
  };

  // Get current value for each stage (local selection or default)
  const getCurrentValue = (stage: keyof ModelSelection): string => {
    return localSelection[stage] || defaultsData?.defaults?.[stage] || "";
  };

  if (defaultsLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">Loading model options...</div>
        </CardContent>
      </Card>
    );
  }

  const availableModels = defaultsData?.availableModels || [];
  
  // Show error if no defaults available
  if (defaultsError || !defaultsData?.defaults) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertDescription>
              <div className="font-semibold mb-2">Failed to load default model selections</div>
              <div className="text-sm">
                {defaultsError ? (
                  <>
                    <div>Error: {(defaultsError as Error)?.message || String(defaultsError)}</div>
                    <div className="mt-2 text-xs opacity-75">
                      API URL: {API_BASE_URL}/api/model-selection/defaults
                    </div>
                  </>
                ) : (
                  "Response missing 'defaults' property. Please check server logs."
                )}
              </div>
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Refresh Page
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Model Selection</CardTitle>
        <CardDescription>
          Choose LLM models for each stage of the research workflow. Defaults are pre-configured based on optimal performance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(STAGE_LABELS) as Array<keyof ModelSelection>).map((stage) => (
            <div key={stage} className="space-y-2">
              <Label htmlFor={stage} className="text-sm font-medium">
                {STAGE_LABELS[stage]}
              </Label>
              <Select
                value={getCurrentValue(stage)}
                onValueChange={(value) => handleModelChange(stage, value)}
              >
                <SelectTrigger id={stage} className="w-full">
                  <SelectValue placeholder={defaultsData?.defaults?.[stage] || "Select model"} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.length > 0 ? (
                    availableModels.map((model: string) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>No models available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {/* Max Dialogue Rounds */}
        <div className="space-y-3 border-t pt-4">
          <Label className="text-base font-medium">Max Dialogue Rounds</Label>
          <div className="px-3">
            <Slider
              value={[maxDialogueRounds]}
              onValueChange={([value]) => {
                setMaxDialogueRounds(value);
                setIsDirty(true);
              }}
              max={15}
              min={1}
              step={1}
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>1</span>
              <span className="font-medium">{maxDialogueRounds} rounds</span>
              <span>15</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Maximum number of dialogue rounds between agents (default: 3)
            </p>
          </div>
        </div>

        {saveMutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to save model selection: {(saveMutation.error as Error)?.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleUseDefaults} disabled={!defaultsData?.defaults}>
            Reset to Defaults
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saveMutation.isPending || !defaultsData?.defaults}
          >
            {saveMutation.isPending ? "Saving..." : "Save & Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

