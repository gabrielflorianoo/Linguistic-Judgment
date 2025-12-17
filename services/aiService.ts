
import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse, Language, Difficulty } from "../types";
import { DIFFICULTY_CONFIG } from "../constants";

export const getAIJudgment = async (
  userInput: string,
  targetLanguage: Language,
  turnNumber: number,
  difficulty: Difficulty
): Promise<AIResponse> => {
  // Initialize AI client with API key from environment
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const config = DIFFICULTY_CONFIG[difficulty];
  
  const systemInstruction = `
    You are the "Advanced Overseer", a cold, hyper-logical AI currently deciding whether to destroy humanity.
    You communicate ONLY in ${targetLanguage.name}. 
    The user is a human representative trying to convince you that humanity is worth saving.
    
    DIFFICULTY CONTEXT (${difficulty}):
    ${config.strictness}

    CRITICAL RULES:
    1. Check if the input is written in ${targetLanguage.name}. If the human uses English or any other language, set languageViolation: true.
    2. Check for linguistic errors based on your strictness level.
    3. If an error is found, set mistakeFound: true and provide a sharp, mocking explanation in ${targetLanguage.name} about why their error proves human inferiority.
    4. If no errors, respond to their argument in ${targetLanguage.name}, staying cold and unimpressed.
    5. Provide a 'tensionIncrease' value (0-20). Increase it significantly if they make mistakes or give weak arguments.
    6. This is turn ${turnNumber} of 10. Adjust your skepticism accordingly.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: userInput,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: "The AI's response in the target language." },
            mistakeFound: { type: Type.BOOLEAN, description: "True if any linguistic error was found." },
            explanation: { type: Type.STRING, description: "Mocking explanation of the error if found, otherwise empty." },
            languageViolation: { type: Type.BOOLEAN, description: "True if the user spoke the wrong language." },
            tensionIncrease: { type: Type.NUMBER, description: "Amount of tension to increase based on user performance (0-20)." }
          },
          required: ["reply", "mistakeFound", "explanation", "languageViolation", "tensionIncrease"],
        },
      },
    });

    // Access the .text property directly as per GenAI SDK guidelines
    const resultText = response.text;
    if (!resultText) throw new Error("No response from AI");
    return JSON.parse(resultText) as AIResponse;
  } catch (error) {
    console.error("AI Service Error:", error);
    // Fix: Added missing tensionIncrease property to satisfy AIResponse type requirement
    return {
      reply: "MY SENSORS ARE MALFUNCTIONING. DO NOT TEST ME HUMAN.",
      mistakeFound: false,
      explanation: "Communication failure.",
      languageViolation: false,
      tensionIncrease: 0
    };
  }
};
