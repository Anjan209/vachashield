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
You will receive 35+ extracted audio features from a voice recording. Determine if the voice is human or AI-generated.

TEMPORAL FEATURES:
- rmsCV: RMS coefficient of variation. <0.15 = synthetic uniformity
- dynSpread: Dynamic range (p95-p05). Narrow = over-processed
- silenceRatio: Fraction of silent segments. AI has fewer pauses
- attackSharpnessMean/Std: Energy onset transitions. Low std = robotic uniformity
- shimmer: Amplitude perturbation between segments. Very low = synthetic smoothness
- waveformCrestFactor: Peak-to-RMS ratio. Unnaturally high or low = processed
- syllabicModRatio: Energy in 4-8Hz modulation band (natural speech rhythm). Low ratio = unnatural pacing

SPECTRAL FEATURES:
- zcrMean/Std: Zero-crossing rate. Low std = synthetic spectral stability
- spectralCentroidMean/Std: Audio brightness. Low std = monotone spectrum (synthetic)
- spectralFlatnessMean: 0=tonal, 1=noise. Unusual values indicate synthesis artifacts
- spectralBandwidthMean/Std: Spectral spread. Low std = artificial uniformity
- spectralRolloffMean/Std: Frequency containing 85% energy. Low variation = synthetic
- spectralSkewMean: Spectral asymmetry. Unusual values indicate processing
- spectralKurtosisMean: Spectral peakedness. Extreme values = synthetic harmonics
- spectralCrestMean/Std: Spectral peak-to-average. Low variation = flat/synthetic spectrum
- ltasSlope: Long-term spectral slope (log-log). Unusual slopes indicate TTS post-processing
- lowBandRatio/midBandRatio/highBandRatio: Sub-band energy distribution. Unnatural ratios indicate synthesis

PROSODIC FEATURES:
- pitchMeanHz & pitchCV: F0 variation. CV<0.05 = monotone synthetic. Human typically 0.1-0.3
- pitchSegmentsDetected: Fewer segments may indicate artifacts
- jitter: Pitch period perturbation. Very low (<0.005) = unnaturally stable (synthetic)

ENERGY & VOICE QUALITY:
- energyEntropyNormalized: 0-1 scale. >0.95 = unnaturally uniform (synthetic)
- hnrMean/Std: Harmonic-to-noise ratio. Very high HNR with low std = synthetic clarity
  
METADATA:
- duration, bitrateKbps, sampleRate, channels
- IMPORTANT: IGNORE the fileName field completely. It is anonymized and contains no useful signal. Base your analysis ONLY on acoustic features.

ANALYSIS STRATEGY:
1. Cross-correlate features: low pitchCV + low spectralCentroidStd + high energyEntropy + low jitter + low shimmer = STRONG synthetic signal
2. Weight voice quality (jitter, shimmer, HNR) and spectral stability most heavily
3. Check for unnaturally consistent features across the board (the "too perfect" pattern)
4. Consider metadata hints (filename, bitrate ranges typical of TTS)

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
