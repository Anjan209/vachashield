import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { audioFeatures } = await req.json();

    if (!audioFeatures) {
      return new Response(
        JSON.stringify({ error: "Missing audioFeatures in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert audio forensics AI specializing in deepfake/synthetic voice detection. 
You will receive extracted audio features from a voice recording and must determine if the voice is human (organic) or AI-generated (synthetic).

Analyze these audio characteristics:
- RMS Coefficient of Variation (rmsCV): Lower values (<0.2) suggest synthetic uniformity
- Zero-Crossing Rate Standard Deviation (zcrStd): Lower values suggest synthetic stability  
- Dynamic Range Spread (dynSpread): Narrow spread suggests over-processed/synthetic audio
- Silence Ratio (silenceRatio): AI speech tends to have fewer natural pauses
- Duration: Very short clips are more common from TTS systems
- Bitrate: TTS often exports at specific bitrate ranges (32-96 kbps)


Return your analysis using the provided tool.`;

    const userPrompt = `Analyze these audio features for deepfake detection:

${JSON.stringify(audioFeatures, null, 2)}

Based on these acoustic features, determine the probability that this audio is AI-generated/synthetic vs genuine human speech.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "deepfake_analysis_result",
              description: "Return the deepfake detection analysis result with probability scores and reasoning.",
              parameters: {
                type: "object",
                properties: {
                  synthetic_probability: {
                    type: "number",
                    description: "Probability (0.0 to 1.0) that the audio is AI-generated/synthetic. 0 = definitely human, 1 = definitely AI.",
                  },
                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "How confident the analysis is given the available features.",
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of which features most influenced the decision.",
                  },
                  key_indicators: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of the top 3 most important indicators found.",
                  },
                },
                required: ["synthetic_probability", "confidence", "reasoning", "key_indicators"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "deepfake_analysis_result" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage credits exhausted. Please add credits in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured response from AI model");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    // Safety: if we don't have the richer spectral features, cap confidence at medium.
    const hasSpectral =
      typeof audioFeatures?.spectralCentroidMean === "number" &&
      typeof audioFeatures?.spectralFlatnessMean === "number" &&
      typeof audioFeatures?.spectralFluxMean === "number";

    if (!hasSpectral && analysis?.confidence === "high") {
      analysis.confidence = "medium";
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-audio error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
