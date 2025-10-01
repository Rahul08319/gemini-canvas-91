import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const generateImage = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt }
      });

      if (error) {
        if (error.message.includes("429")) {
          toast.error("Rate limit exceeded. Please try again later.");
        } else if (error.message.includes("402")) {
          toast.error("Please add credits to your workspace to continue.");
        } else {
          toast.error("Failed to generate image");
        }
        console.error('Error:', error);
        return;
      }

      if (data?.image) {
        setImageUrl(data.image);
        toast.success("Image generated successfully!");
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadImage = () => {
    if (!imageUrl) return;
    
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `generated-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Image downloaded!");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/95 py-12 px-4">
      <div className="container max-w-6xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 mb-4 text-primary">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            AI Image Generator
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Transform your ideas into stunning visuals with the power of Gemini AI
          </p>
        </header>

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <Card className="p-6 border-border/50 bg-card/50 backdrop-blur-sm shadow-lg">
            <div className="space-y-4">
              <div>
                <label htmlFor="prompt" className="text-sm font-medium text-foreground mb-2 block">
                  Enter your prompt
                </label>
                <Textarea
                  id="prompt"
                  placeholder="Describe the image you want to create... (e.g., 'A serene mountain landscape at sunset with vibrant colors')"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[200px] resize-none bg-background/50 border-border/50 focus:border-primary transition-colors"
                  disabled={isLoading}
                />
              </div>

              <Button
                onClick={generateImage}
                disabled={isLoading || !prompt.trim()}
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity shadow-glow"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate Image
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Powered by Gemini AI • Free to use during beta
              </p>
            </div>
          </Card>

          {/* Image Display Section */}
          <Card className="p-6 border-border/50 bg-card/50 backdrop-blur-sm shadow-lg">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Generated Image</h2>
                {imageUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadImage}
                    className="border-border/50 hover:bg-accent/10"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                )}
              </div>

              <div className="aspect-square rounded-lg bg-muted/30 border-2 border-dashed border-border/50 flex items-center justify-center overflow-hidden">
                {isLoading ? (
                  <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                    <p className="text-sm text-muted-foreground">Creating your masterpiece...</p>
                  </div>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Generated artwork"
                    className="w-full h-full object-contain animate-fade-in"
                  />
                ) : (
                  <div className="text-center space-y-2 p-8">
                    <Sparkles className="h-12 w-12 text-muted-foreground/50 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      Your generated image will appear here
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Tips Section */}
        <Card className="mt-8 p-6 border-border/50 bg-card/50 backdrop-blur-sm">
          <h3 className="text-lg font-semibold mb-3">💡 Tips for better results:</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Be specific and descriptive in your prompts</li>
            <li>• Mention the style you want (e.g., "photorealistic", "digital art", "watercolor")</li>
            <li>• Include details about lighting, colors, and mood</li>
            <li>• Experiment with different descriptions to see what works best</li>
          </ul>
        </Card>
      </div>
    </main>
  );
};

export default Index;
