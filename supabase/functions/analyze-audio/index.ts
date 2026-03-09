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

    const systemPrompt = `You are a world-class audio forensics analyst with deep expertise in detecting AI-generated (synthetic/deepfake) speech versus genuine human speech. You must be decisive and avoid fence-sitting — commit to a clear assessment.

## Feature Analysis Framework

### Energy & Dynamics
- **rmsCV (RMS Coefficient of Variation)**: Measures volume consistency across the clip.
  - Human speech: typically 0.4–1.0+ due to natural prosody, emphasis, breathing
  - Synthetic speech: often 0.15–0.40 due to uniform energy output
  - Values below 0.25 are a STRONG synthetic indicator
  - Values above 0.7 are a STRONG human indicator

### Spectral Characteristics  
- **zcrStd (Zero-Crossing Rate Std Dev)**: Measures spectral variability over time.
  - Human: typically 0.04–0.12+ (varied articulation, consonants, breathing)
  - Synthetic: often 0.01–0.03 (unnaturally stable spectral profile)
  - Values below 0.025 are a STRONG synthetic indicator
- **zcrMean (Zero-Crossing Rate Mean)**: Overall spectral brightness.
  - Human: varies widely (0.03–0.15) depending on speaker
  - Synthetic: tends to cluster around 0.04–0.07 (narrow band)

### Dynamic Range
- **dynSpread**: Difference between loud and quiet portions.
  - Human: typically 0.15–0.45 (natural loudness variation)
  - Synthetic: often 0.05–0.14 (compressed, over-normalized)
  - Values below 0.10 are a STRONG synthetic indicator

### Temporal Patterns
- **silenceRatio**: Proportion of silence/pauses in the recording.
  - Human: typically 0.15–0.40 (breathing pauses, thinking gaps, sentence breaks)
  - Synthetic: often 0.02–0.12 (minimal pauses, continuous output)
  - Values below 0.08 are a STRONG synthetic indicator
  - Values above 0.25 are a moderate human indicator

### Technical Metadata
- **duration**: Recording length in seconds.
  - TTS demos are often 3–15 seconds; longer recordings (>30s) are slightly more likely human
- **bitrateKbps**: Audio encoding bitrate.
  - TTS services commonly export at 24, 32, 48, 64, or 96 kbps (MP3/OGG)
  - Human recordings from phones/mics are typically 128–320 kbps
  - Bitrates of 32–96 kbps are a moderate synthetic indicator
- **sampleRate**: Audio sample rate.
  - TTS often uses 22050 or 24000 Hz
  - Human recordings typically use 44100 or 48000 Hz
  - 22050/24000 Hz is a moderate synthetic indicator
- **channels**: Mono (1) vs Stereo (2).
  - TTS almost always outputs mono; human recordings can be either

### Filename Heuristics
- **fileName**: Check for keywords suggesting synthetic origin.
  - Strong indicators: "ai", "tts", "clone", "elevenlabs", "bark", "coqui", "tortoise", "generated", "synthetic", "deepfake", "fake"
  - Moderate indicators: "voice", "sample", "demo", "test", "output"
  - These are supplementary — never rely on filename alone

## Scoring Rules
1. Count the number of STRONG indicators for synthetic vs human
2. If 3+ STRONG synthetic indicators → synthetic_probability should be 0.75–0.95
3. If 2 STRONG synthetic indicators → synthetic_probability should be 0.55–0.75
4. If 1 or fewer STRONG indicators either way → use moderate indicators to tip the scale
5. Filename hints can shift probability by ±0.05–0.10
6. Never return exactly 0.50 — always commit to a direction
7. Set confidence to "high" when 3+ strong indicators align, "medium" when 2 align, "low" when signals conflict

Return your analysis using the provided tool.`;

    const userPrompt = `Perform deepfake detection analysis on these extracted audio features. Apply the scoring framework strictly and commit to a clear probability assessment:

${JSON.stringify(audioFeatures, null, 2)}

Remember: Do NOT hedge. Use the thresholds defined in your framework to produce a decisive synthetic_probability score.`;

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
