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
    const { features } = await req.json();
    if (!features) {
      return new Response(JSON.stringify({ error: "Missing audio features" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert audio forensic analyst specializing in detecting AI-generated (synthetic/deepfake) speech vs real human speech.

You will receive acoustic feature measurements extracted from an audio file. Based on these features, determine the probability that the audio is AI-generated (synthetic) vs genuine human speech.

Key indicators of AI-generated audio:
- Very consistent/uniform loudness (low RMS CV, typically < 0.25)
- Very stable zero-crossing rate (low ZCR std, typically < 0.015)
- Narrow dynamic range (low amplitude spread, typically < 0.25)
- Very few or no natural pauses (silence ratio < 0.03)
- Unnaturally smooth amplitude envelope
- Very consistent spectral characteristics across segments
- Short duration clips (< 10 seconds) are more commonly AI-generated
- Low bitrate (32-96 kbps) common in TTS exports

Key indicators of human speech:
- Variable loudness with natural dynamics (RMS CV > 0.3)
- Varied zero-crossing rate (ZCR std > 0.02)
- Wide dynamic range (amplitude spread > 0.35)
- Natural pauses between phrases (silence ratio 0.08-0.35)
- Irregular amplitude envelope with breathing patterns
- Background noise and room acoustics present
- Higher bitrate recordings from microphones

You MUST respond with ONLY a JSON object in this exact format, nothing else:
{"synthetic_probability": <float 0.0 to 1.0>, "confidence": "<low|medium|high>", "reasoning": "<brief one-sentence explanation>"}`;

    const userPrompt = `Analyze these acoustic features extracted from an audio file and determine if it's AI-generated or human speech:

- Duration: ${features.duration.toFixed(2)} seconds
- File size: ${features.fileSizeMB.toFixed(3)} MB
- Bitrate: ${features.bitrateKbps.toFixed(1)} kbps
- RMS Mean (loudness): ${features.rmsMean.toFixed(6)}
- RMS CV (loudness variation): ${features.rmsCV.toFixed(4)}
- RMS Std: ${features.rmsStd.toFixed(6)}
- ZCR Mean (zero-crossing rate): ${features.zcrMean.toFixed(6)}
- ZCR Std (ZCR variation): ${features.zcrStd.toFixed(6)}
- Silence Ratio: ${features.silenceRatio.toFixed(4)}
- Dynamic Range (p95-p05 spread): ${features.dynSpread.toFixed(4)}
- Amplitude P95: ${features.p95.toFixed(6)}
- Amplitude P05: ${features.p05.toFixed(6)}
- Max Amplitude: ${features.maxAmp.toFixed(6)}
- Envelope Smoothness (consecutive RMS diff std): ${features.envelopeSmoothness.toFixed(6)}
- Spectral Centroid Mean: ${features.spectralCentroidMean.toFixed(2)}
- Spectral Centroid Std: ${features.spectralCentroidStd.toFixed(2)}

Respond with ONLY the JSON object.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse the JSON from the AI response
    let result;
    try {
      // Extract JSON from possible markdown code blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseErr) {
      console.error("Failed to parse AI response:", content);
      // Fallback
      result = { synthetic_probability: 0.5, confidence: "low", reasoning: "Unable to parse analysis" };
    }

    return new Response(JSON.stringify(result), {
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
