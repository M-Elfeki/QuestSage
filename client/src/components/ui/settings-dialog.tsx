import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Settings, Key, Database, Zap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface SystemConfig {
  mode: 'mock' | 'real';
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

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery<SystemConfig>({
    queryKey: ['/api/config'],
    enabled: open
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

  const [localConfig, setLocalConfig] = useState<SystemConfig | null>(null);

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleSave = () => {
    if (localConfig) {
      updateConfig.mutate(localConfig);
      setOpen(false);
    }
  };

  if (!localConfig) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          data-testid="button-settings"
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle data-testid="title-settings">Quest System Configuration</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* System Mode */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5" />
              <Label className="text-base font-medium">System Mode</Label>
              <Badge 
                variant={localConfig.mode === 'real' ? 'default' : 'secondary'}
                data-testid={`badge-mode-${localConfig.mode}`}
              >
                {localConfig.mode === 'real' ? 'Real Mode' : 'Mock Mode'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {localConfig.mode === 'real' 
                ? 'Using real API providers for research and analysis'
                : 'Using mock responses for demonstration (API keys needed for real mode)'
              }
            </p>
          </div>

          {/* Max Dialogue Rounds */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Max Dialogue Rounds</Label>
            <div className="px-3">
              <Slider
                value={[localConfig.maxDialogueRounds]}
                onValueChange={([value]) => 
                  setLocalConfig({ ...localConfig, maxDialogueRounds: value })
                }
                max={15}
                min={3}
                step={1}
                data-testid="slider-max-rounds"
              />
              <div className="flex justify-between text-sm text-muted-foreground mt-1">
                <span>3</span>
                <span data-testid="text-current-rounds">{localConfig.maxDialogueRounds} rounds</span>
                <span>15</span>
              </div>
            </div>
          </div>

          {/* Provider Status */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5" />
              <Label className="text-base font-medium">API Provider Status</Label>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(localConfig.enabledProviders).map(([provider, enabled]) => (
                <div 
                  key={provider} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                  data-testid={`provider-${provider}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="font-medium capitalize">{provider}</span>
                  </div>
                  <Badge variant={enabled ? 'default' : 'secondary'}>
                    {enabled ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
            
            <p className="text-sm text-muted-foreground">
              Providers are automatically detected based on available API keys. 
              Contact support for help configuring API access.
            </p>
          </div>

          {/* Database Status */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5" />
              <Label className="text-base font-medium">Database Storage</Label>
              <Badge variant="default" data-testid="badge-database">
                PostgreSQL Connected
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Research sessions and dialogue history are automatically saved to persistent storage.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={updateConfig.isPending}
            data-testid="button-save-settings"
          >
            {updateConfig.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}