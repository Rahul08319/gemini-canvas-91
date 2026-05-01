import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";

interface Generation {
  id: string;
  prompt: string;
  image_url: string;
  created_at: string;
}

const History = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAuthChecked(true);
      if (!s) navigate("/auth", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthChecked(true);
      if (!s) navigate("/auth", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("generations")
        .select("id, prompt, image_url, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        toast.error("Failed to load history");
      } else {
        setItems(data ?? []);
      }
      setLoading(false);
    })();
  }, [session]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("generations").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Deleted");
  };

  const downloadImage = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!authChecked || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/95 py-12 px-4">
      <div className="container max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to generator
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Your generation history</h1>
          <div />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            No generations yet. Create your first image!
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
                <div className="aspect-square bg-muted/30 overflow-hidden">
                  <img
                    src={item.image_url}
                    alt={item.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm line-clamp-3" title={item.prompt}>
                    {item.prompt}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => downloadImage(item.image_url)}
                    >
                      <Download className="mr-2 h-3 w-3" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default History;
