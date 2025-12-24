
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("VITE_GEMINI_API_KEY is not defined in environment variables");
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || '' });
  }

  async analyzeOffer(
    content: string,
    type: 'text' | 'image' | 'url'
  ): Promise<AnalysisResult> {
    const modelName = type === 'image' ? 'gemini-flash-latest' : 'gemini-flash-latest'; // Use the latest flash model which is known to work
    const prompt = `
      You are an AI Scam Detection Analyst specialized in identifying fake internship and job offers.
      Your task is to analyze the provided input and determine if it's a scam.
      
      Input Content: ${type === 'url' ? 'URL to investigate' : 'Content provided'}: ${content}

      Follow this workflow:
      1. Identify input type.
      2. Confirm if it's an internship/job offer.
      3. Verify source (official domain, website legitimacy).
      4. Analyze details (role, duration, stipend).
      5. Check skill matching.
      6. Evaluate interview process.
      7. Verify online presence (LinkedIn, Glassdoor).
      8. Check HR info.
      9. Detect red flags (money requests, urgency, etc).
      10. Calculate score (Start at 100).
      
      Deduction Rules:
      - No official email domain: -15
      - No company website: -20
      - Asking for money or fees: -40
      - No interview process: -20
      - Unrealistic stipend or role: -15
      - No online presence: -25
      - Poor formatting or missing information: -10

      Classification:
      - 80–100 -> Legit
      - 50–79 -> Suspicious
      - < 50 -> Fake

      Return the analysis in JSON format only with the following structure:
      {
        "offerType": "string",
        "sourceVerification": "string",
        "companyVerification": "string",
        "internshipDetailsReview": "string",
        "redFlagsDetected": ["string"],
        "credibilityScore": number,
        "finalVerdict": "Legit" | "Suspicious" | "Fake",
        "safetyAdvice": ["string"]
      }
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: modelName,
        contents: [{
          parts: [
            { text: prompt },
            ...(type === 'image' ? [{ inlineData: { data: content, mimeType: 'image/jpeg' } }] : [])
          ]
        }],
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.1,
        },
      } as any);

      let resultText = response.text || '{}';
      // Robust JSON extraction from potential markdown blocks
      if (resultText.includes('```')) {
        const match = resultText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          resultText = match[1];
        }
      }
      const parsed = JSON.parse(resultText.trim()) as AnalysisResult;

      // Extract grounding sources
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
        parsed.groundingSources = groundingChunks
          .filter(chunk => chunk.web)
          .map(chunk => ({
            title: chunk.web?.title || 'External Source',
            uri: chunk.web?.uri || ''
          }));
      }

      return parsed;
    } catch (error) {
      console.error("Gemini Analysis Error:", error);
      throw error;
    }
  }
}
