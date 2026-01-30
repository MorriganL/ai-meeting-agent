
import { GoogleGenAI, Type } from "@google/genai";
import { type AnalysisResult, type Meeting } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.ARRAY,
      description: "The full transcript of the audio, with each part attributed to a specific speaker.",
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: {
            type: Type.STRING,
            description: "The identified speaker. Use their actual name if it's mentioned in the audio (e.g., 'Alice', 'Bob'). Otherwise, use a generic label like 'Speaker 1'."
          },
          text: {
            type: Type.STRING,
            description: "The transcribed text spoken by the speaker."
          },
        },
        required: ["speaker", "text"]
      }
    },
    summary: {
      type: Type.STRING,
      description: "A concise summary of the meeting's key discussion points. Formatted as a markdown bulleted list."
    },
    actionItems: {
      type: Type.STRING,
      description: "A list of actionable items, tasks, or instructions mentioned during the meeting. Formatted as a markdown bulleted list."
    }
  },
  required: ["transcript", "summary", "actionItems"]
};


export async function analyzeMeetingAudio(audioBase64: string, mimeType: string, model: string): Promise<AnalysisResult> {
    const audioPart = {
        inlineData: {
            data: audioBase64,
            mimeType: mimeType,
        },
    };

    const textPart = {
        text: `
          You are an expert meeting assistant. Your task is to analyze the provided audio file.
          1.  Perform speaker diarization to distinguish between different speakers. Crucially, try to identify speakers by their actual names if they are mentioned during the conversation. If a speaker's name is not mentioned, use a generic label like 'Speaker 1', 'Speaker 2', etc.
          2.  Transcribe the entire conversation accurately.
          3.  Based on the full transcript, generate a concise summary of the key discussion points.
          4.  Extract a clear list of all action items, instructions, or tasks mentioned.
          
          The final output must be a single JSON object that conforms to the provided schema.
          For the summary and action items, use markdown-style bullet points (e.g., "* Point 1").
        `,
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [audioPart, textPart] },
            config: {
              responseMimeType: "application/json",
              responseSchema: analysisSchema,
            },
        });
        
        const responseText = response.text;
        if (!responseText) {
          throw new Error("Received an empty response from the API.");
        }

        const parsedResult = JSON.parse(responseText) as AnalysisResult;
        
        // Basic validation
        if (!parsedResult.transcript || !parsedResult.summary || !parsedResult.actionItems) {
            throw new Error("The API response is missing required fields.");
        }

        return parsedResult;

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error("Failed to process audio with Gemini API.");
    }
}


export async function answerQuestionFromMeetings(question: string, meetings: Meeting[], model: string): Promise<string> {
  const formattedContext = meetings
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) // Ensure chronological order
    .map(meeting => `
---
START OF TRANSCRIPT FOR MEETING: "${meeting.title}" (Date: ${new Date(meeting.timestamp).toLocaleString()})
${meeting.analysis.transcript.map(turn => `${turn.speaker}: ${turn.text}`).join('\n')}
END OF TRANSCRIPT FOR MEETING: "${meeting.title}"
---
    `).join('\n\n');

  const prompt = `
    You are an AI assistant specialized in analyzing meeting transcripts.
    Your task is to answer the user's question based *exclusively* on the information contained within the provided meeting transcripts.
    Do not use any external knowledge or make assumptions beyond what is written in the text.
    If the answer cannot be found in the transcripts, you must state "The answer to this question cannot be found in the selected meetings."

    IMPORTANT RULE: The meetings are provided in chronological order. If different meetings contain conflicting information or decisions, you must prioritize the information from the most recent meeting. The latest agreement is the one that is currently valid.

    Here are the transcripts:
    ${formattedContext}

    Now, please answer the following question: "${question}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    
    const responseText = response.text;
    if (!responseText) {
      throw new Error("Received an empty response from the AI.");
    }
    return responseText;
  } catch (error) {
    console.error("Error calling Gemini API for Q&A:", error);
    throw new Error("Failed to get an answer from the AI.");
  }
}
