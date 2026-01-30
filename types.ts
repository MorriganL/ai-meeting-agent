
export interface SpeakerTurn {
  speaker: string;
  text: string;
}

export interface AnalysisResult {
  transcript: SpeakerTurn[];
  summary: string;
  actionItems: string;
}

export enum AppState {
  INITIAL = 'initial',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface Meeting {
  id: string;
  title: string;
  timestamp: string; // ISO string for dates
  analysis: AnalysisResult;
}
