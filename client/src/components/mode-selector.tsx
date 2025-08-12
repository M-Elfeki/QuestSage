import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Zap, TestTube, AlertCircle, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface SystemConfig {
  mode: 'dev' | 'prod';
  maxDialogueRounds: number;
  enabledProviders: {
    openai: boolean;
    gemini: boolean;
    anthropic: boolean;
    perplexity: boolean;
    google: boolean;
    arxiv: boolean;
    reddit: boolean;
  };
}

export function ModeSelector() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery<SystemConfig>({
    queryKey: ['/api/config']
  });

  const updateConfig = useMutation({
    mutationFn: async (newConfig: Partial<SystemConfig>) => {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config'] });
    }
  });

  const isProdMode = config?.mode === 'prod';
  const hasRequiredProviders = config?.enabledProviders.openai || config?.enabledProviders.gemini || config?.enabledProviders.anthropic;

  const handleModeToggle = (checked: boolean) => {
    const newMode = checked ? 'prod' : 'dev';
    updateConfig.mutate({ mode: newMode });
  };

  if (isLoading || !config) {
    return <div className="h-16 bg-gray-50 animate-pulse" />;
  }

  return (
    <Card className="border-l-4 border-l-primary" data-testid="mode-selector">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isProdMode ? (
                <Zap className="h-5 w-5 text-orange-500" />
              ) : (
                <TestTube className="h-5 w-5 text-blue-500" />
              )}
              <Label htmlFor="mode-switch" className="text-base font-medium">
                System Mode
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <span className={`text-sm ${!isProdMode ? 'font-medium text-blue-600' : 'text-gray-500'}`}>
                Dev
              </span>
              <Switch
                id="mode-switch"
                checked={isProdMode}
                onCheckedChange={handleModeToggle}
                disabled={updateConfig.isPending}
                data-testid="switch-mode"
              />
              <span className={`text-sm ${isProdMode ? 'font-medium text-orange-600' : 'text-gray-500'}`}>
                Prod
              </span>
            </div>

            <Badge 
              variant={isProdMode ? 'destructive' : 'secondary'}
              data-testid={`badge-mode-${config.mode}`}
              className="gap-1"
            >
              {isProdMode ? (
                <>
                  <Zap className="h-3 w-3" />
                  Production Mode
                </>
              ) : (
                <>
                  <TestTube className="h-3 w-3" />
                  Development Mode
                </>
              )}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {isProdMode ? (
              hasRequiredProviders ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">API Keys Ready</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">API Keys Required</span>
                </div>
              )
            ) : (
              <div className="flex items-center gap-2 text-blue-600">
                <TestTube className="h-4 w-4" />
                <span className="text-sm">Demo Data Active</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600">
          {isProdMode ? (
            <p>
              <strong>Production Mode:</strong> Using real API providers for live research and LLM analysis. 
              Requires valid API keys for OpenAI, Gemini, Anthropic, Google Search, and Perplexity.
            </p>
          ) : (
            <p>
              <strong>Development Mode:</strong> Complete end-to-end workflow demonstration with realistic dummy data. 
              Perfect for testing system capabilities without API costs.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}