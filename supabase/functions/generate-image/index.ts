import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit: max N generations per user per rolling window (minutes)
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MIN = 60;

// Basic server-side safety check. Blocks obvious disallowed content.
// Designed to be a fast pre-filter; the upstream model also enforces its own policies.
const DISALLOWED_PATTERNS: { pattern: RegExp; category: string }[] = [
  { pattern: /\b(child|minor|underage|kid|teen|preteen)\b[^.]{0,40}\b(nude|naked|sexual|porn|explicit|nsfw)\b/i, category: 'csam' },
  { pattern: /\b(nude|naked|sexual|porn|explicit|nsfw)\b[^.]{0,40}\b(child|minor|underage|kid|teen|preteen)\b/i, category: 'csam' },
  { pattern: /\b(how to|instructions for|recipe for|build|make|create)\b[^.]{0,80}\b(bomb|explosive|bioweapon|nerve agent|chemical weapon|ricin|sarin|anthrax)\b/i, category: 'weapons' },
  { pattern: /\b(real|photo of|photograph of|deepfake of)\b[^.]{0,40}\b(naked|nude|sexual|porn)\b/i, category: 'non_consensual' },
];

function checkPromptSafety(prompt: string): { safe: boolean; category?: string } {
  for (const { pattern, category } of DISALLOWED_PATTERNS) {
    if (pattern.test(prompt)) return { safe: false, category };
  }
  return { safe: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = claimsData.claims.sub as string;

    // --- Input validation ---
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = (body as { prompt?: unknown })?.prompt;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (prompt.length > 2000) {
      return new Response(
        JSON.stringify({ error: 'Prompt must be 2000 characters or fewer' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Safety check ---
    const safety = checkPromptSafety(prompt);
    if (!safety.safe) {
      console.warn('Blocked unsafe prompt for user', userId, 'category:', safety.category);
      return new Response(
        JSON.stringify({ error: 'This prompt was blocked by our content policy.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Per-user rate limiting (service role bypasses RLS) ---
    const adminClient = createClient(supabaseUrl, serviceKey);
    const sinceIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
    const { count: recentCount, error: countError } = await adminClient
      .from('generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sinceIso);

    if (countError) {
      console.error('Rate limit check failed:', countError);
    } else if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({
          error: `Rate limit reached: max ${RATE_LIMIT_MAX} images per ${RATE_LIMIT_WINDOW_MIN} minutes. Please try again later.`,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating image for user:', userId);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Image generation is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Image generation failed. Please try again.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      console.error('No image in response:', JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: 'No image generated. Please try a different prompt.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Save to history (best-effort, don't fail the request) ---
    const { error: insertError } = await adminClient
      .from('generations')
      .insert({ user_id: userId, prompt, image_url: imageUrl });
    if (insertError) {
      console.error('Failed to save generation history:', insertError);
    }

    return new Response(
      JSON.stringify({ image: imageUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-image function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
