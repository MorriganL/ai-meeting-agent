
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { type AnalysisResult, AppState, Meeting } from './types';
import { analyzeMeetingAudio, answerQuestionFromMeetings } from './services/geminiService';
import { UploadIcon, MicIcon, ListIcon, CheckCircleIcon, XCircleIcon, ProcessingIcon, UsersIcon, SaveIcon, TrashIcon, ArchiveBoxIcon, QuestionMarkCircleIcon, RedoIcon } from './components/IconComponents';

type ModelType = 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

const App: React.FC = () => {
  // General App State
  const [view, setView] = useState<'analyze' | 'qa'>('analyze');
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelType>('gemini-3-flash-preview');

  // Analysis State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [appState, setAppState] = useState<AppState>(AppState.INITIAL);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [speakerNameMap, setSpeakerNameMap] = useState<Record<string, string>>({});
  const [uniqueSpeakers, setUniqueSpeakers] = useState<string[]>([]);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [tempSpeakerName, setTempSpeakerName] = useState('');
  const [editingTranscript, setEditingTranscript] = useState<{ index: number; text: string } | null>(null);
  const [editingSection, setEditingSection] = useState<'summary' | 'actionItems' | null>(null);
  const [tempSummary, setTempSummary] = useState('');
  const [tempActionItems, setTempActionItems] = useState('');
  
  // Saved Meetings & QA State
  const [savedMeetings, setSavedMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingIds, setSelectedMeetingIds] = useState<Set<string>>(new Set());
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);

  // Load saved meetings from localStorage on initial render
  useEffect(() => {
    try {
      const storedMeetings = localStorage.getItem('savedMeetings');
      if (storedMeetings) {
        setSavedMeetings(JSON.parse(storedMeetings));
      }
    } catch (e) {
      console.error("Failed to load meetings from localStorage", e);
      setError("Could not load saved meetings.");
    }
  }, []);

  // Persist saved meetings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('savedMeetings', JSON.stringify(savedMeetings));
    } catch (e) {
      console.error("Failed to save meetings to localStorage", e);
      setError("Could not save meetings. Your changes might not persist.");
    }
  }, [savedMeetings]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setError(null);
    }
  };

  const processAudio = useCallback(async () => {
    if (!audioFile) {
      setError('Please select an audio file first.');
      return;
    }
    setAppState(AppState.LOADING);
    setError(null);
    setAnalysisResult(null);

    try {
      const base64Audio = await fileToBase64(audioFile);
      const result = await analyzeMeetingAudio(base64Audio, audioFile.type, selectedModel);
      
      const speakers = [...new Set(result.transcript.map(t => t.speaker))].sort();
      const initialMap = speakers.reduce((acc, speaker) => ({ ...acc, [speaker]: speaker }), {});

      setUniqueSpeakers(speakers);
      setSpeakerNameMap(initialMap);
      setAnalysisResult(result);
      setAppState(AppState.SUCCESS);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to analyze audio. ${errorMessage}`);
      setAppState(AppState.ERROR);
    }
  }, [audioFile, selectedModel]);

  const handleResetAnalysis = () => {
    setAudioFile(null);
    setAnalysisResult(null);
    setError(null);
    setAppState(AppState.INITIAL);
    setSpeakerNameMap({});
    setUniqueSpeakers([]);
    setEditingSpeaker(null);
    setTempSpeakerName('');
    setEditingTranscript(null);
    setEditingSection(null);
    setTempSummary('');
    setTempActionItems('');
  };

  const handleSaveMeeting = () => {
    if (!analysisResult || !audioFile) return;

    // Apply any pending edits before saving
    const finalTranscript = analysisResult.transcript.map(turn => ({
      ...turn,
      speaker: speakerNameMap[turn.speaker] || turn.speaker,
    }));
    
    const newMeeting: Meeting = {
      id: crypto.randomUUID(),
      title: audioFile.name.replace(/\.[^/.]+$/, ""), // remove file extension
      timestamp: new Date().toISOString(),
      analysis: { ...analysisResult, transcript: finalTranscript },
    };
    setSavedMeetings(prev => [...prev, newMeeting]);
    handleResetAnalysis(); // Clear the analysis view after saving
  };
  
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      setError(null);
    } else {
      setError("Please drop a valid audio file.");
    }
  };

  const speakerColors = useMemo(() => {
    const colors = ['bg-sky-900/50', 'bg-emerald-900/50', 'bg-indigo-900/50', 'bg-rose-900/50', 'bg-amber-900/50', 'bg-fuchsia-900/50'];
    const speakerMap = new Map<string, string>();
    uniqueSpeakers.forEach((speaker, index) => {
      speakerMap.set(speaker, colors[index % colors.length]);
    });
    return speakerMap;
  }, [uniqueSpeakers]);

  const handleEditSpeaker = (speakerId: string) => { setEditingSpeaker(speakerId); setTempSpeakerName(speakerNameMap[speakerId]); };
  const handleCancelSpeakerEdit = () => { setEditingSpeaker(null); setTempSpeakerName(''); };
  const handleSaveSpeakerName = () => {
    if (editingSpeaker && tempSpeakerName.trim()) {
      setSpeakerNameMap(prev => ({ ...prev, [editingSpeaker]: tempSpeakerName.trim() }));
    }
    handleCancelSpeakerEdit();
  };

  const handleEditTranscript = (index: number, currentText: string) => {
    setEditingTranscript({ index, text: currentText });
  };
  const handleSaveTranscript = () => {
    if (editingTranscript === null || !analysisResult) return;
    const updatedTranscript = analysisResult.transcript.map((turn, index) => 
      index === editingTranscript.index ? { ...turn, text: editingTranscript.text.trim() } : turn
    );
    setAnalysisResult(prev => prev ? { ...prev, transcript: updatedTranscript } : null);
    setEditingTranscript(null);
  };
  const handleCancelTranscriptEdit = () => setEditingTranscript(null);

  const handleEditSection = (section: 'summary' | 'actionItems') => {
    if (!analysisResult) return;
    setEditingSection(section);
    if (section === 'summary') {
        setTempSummary(analysisResult.summary);
    } else {
        setTempActionItems(analysisResult.actionItems);
    }
  };
  const handleSaveSection = () => {
      if (!analysisResult || !editingSection) return;
      if (editingSection === 'summary') {
          setAnalysisResult(prev => prev ? { ...prev, summary: tempSummary.trim() } : null);
      } else {
          setAnalysisResult(prev => prev ? { ...prev, actionItems: tempActionItems.trim() } : null);
      }
      setEditingSection(null);
  };
  const handleCancelSectionEdit = () => setEditingSection(null);


  // --- QA Handlers ---
  const handleToggleMeetingSelection = (meetingId: string) => {
    setSelectedMeetingIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(meetingId)) {
        newSet.delete(meetingId);
      } else {
        newSet.add(meetingId);
      }
      return newSet;
    });
  };

  const handleDeleteMeeting = (meetingId: string) => {
    if (window.confirm("Are you sure you want to delete this meeting?")) {
        setSavedMeetings(prev => prev.filter(m => m.id !== meetingId));
        setSelectedMeetingIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(meetingId);
            return newSet;
        });
    }
  };

  const handleAskQuestion = async () => {
    if (!qaQuestion.trim() || selectedMeetingIds.size === 0) {
        setError("Please select at least one meeting and ask a question.");
        return;
    }
    setError(null);
    setIsAnswering(true);
    setQaAnswer(null);

    const selectedMeetings = savedMeetings.filter(m => selectedMeetingIds.has(m.id));
    
    try {
        const answer = await answerQuestionFromMeetings(qaQuestion, selectedMeetings, selectedModel);
        setQaAnswer(answer);
    } catch(err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to get answer. ${errorMessage}`);
    } finally {
        setIsAnswering(false);
    }
  };

  const ModelSelector = () => (
    <div className="flex justify-center items-center gap-2 bg-gray-900/70 p-1 rounded-full border border-gray-700 my-4">
        <span className="text-sm font-semibold text-gray-400 pl-3">Model:</span>
        <button 
            onClick={() => setSelectedModel('gemini-3-flash-preview')}
            className={`px-4 py-1 rounded-full text-sm font-semibold transition-colors ${selectedModel === 'gemini-3-flash-preview' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
        >
            Flash
        </button>
        <button 
            onClick={() => setSelectedModel('gemini-3-pro-preview')}
            className={`px-4 py-1 rounded-full text-sm font-semibold transition-colors ${selectedModel === 'gemini-3-pro-preview' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
        >
            Pro
        </button>
    </div>
  );

  const renderAnalysisView = () => (
    <>
      {appState === AppState.INITIAL && (
        <div 
          className={`w-full p-8 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-purple-500 bg-gray-700/50' : 'border-gray-600 hover:border-cyan-500'}`}
          onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
        >
          <div className="flex flex-col items-center text-center">
            <UploadIcon className="w-16 h-16 text-gray-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">{isDragging ? 'Drop your audio file here' : 'Drag & drop or select an audio file'}</h2>
            <p className="text-gray-400 mb-4">Supports MP3, WAV, M4A, etc.</p>
            <input type="file" id="audio-upload" className="hidden" accept="audio/*" onChange={handleFileChange} />
            <label htmlFor="audio-upload" className="cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded-lg transition-transform transform hover:scale-105">Select File</label>
            {audioFile && <p className="mt-4 text-emerald-400">Selected: {audioFile.name}</p>}
          </div>
        </div>
      )}

      {audioFile && appState !== AppState.SUCCESS && (
         <div className="mt-4 flex flex-col items-center gap-4">
            <ModelSelector />
           <button onClick={processAudio} disabled={!audioFile || appState === AppState.LOADING} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 flex items-center gap-2">
              <MicIcon className="w-5 h-5" /> Analyze Meeting
            </button>
         </div>
      )}

      {appState === AppState.LOADING && (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <ProcessingIcon className="w-16 h-16 text-cyan-400" />
          <p className="mt-4 text-xl font-semibold animate-pulse">Analyzing audio... this may take a moment.</p>
          <p className="text-gray-400">Processing: {audioFile?.name}</p>
        </div>
      )}

      {appState === AppState.SUCCESS && analysisResult && (
        <>
            <div className="space-y-8 mt-6">
                <div>
                  <h2 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2"><UsersIcon className="w-6 h-6"/>Speakers</h2>
                  <div className="bg-gray-900/70 rounded-lg p-4 space-y-2">
                    {uniqueSpeakers.map(speakerId => (
                      <div key={speakerId} className="flex items-center justify-between p-2 rounded-md">
                        <div className="flex items-center gap-3">
                          <span className={`w-4 h-4 rounded-full flex-shrink-0 ${speakerColors.get(speakerId)}`}></span>
                          {editingSpeaker === speakerId ? (
                            <input type="text" value={tempSpeakerName} onChange={(e) => setTempSpeakerName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSpeakerName(); if (e.key === 'Escape') handleCancelSpeakerEdit(); }} onBlur={handleSaveSpeakerName} className="bg-gray-700 text-white px-2 py-1 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" autoFocus />
                          ) : (
                            <span onClick={() => handleEditSpeaker(speakerId)} className="font-semibold text-gray-200 cursor-pointer hover:bg-gray-700/50 px-2 py-1 rounded-md">{speakerNameMap[speakerId]}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2"><MicIcon className="w-6 h-6"/>Transcript</h2>
                  <div className="bg-gray-900/70 rounded-lg p-4 max-h-[400px] overflow-y-auto space-y-3">
                    {analysisResult.transcript.map((turn, index) => (
                      <div key={index} className={`p-3 rounded-lg ${speakerColors.get(turn.speaker) || 'bg-gray-800/50'}`}>
                        <p className="font-bold text-gray-200">{speakerNameMap[turn.speaker] || turn.speaker}</p>
                        {editingTranscript?.index === index ? (
                            <textarea value={editingTranscript.text} onChange={e => setEditingTranscript({index, text: e.target.value})} onBlur={handleSaveTranscript} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveTranscript(); } if (e.key === 'Escape') { handleCancelTranscriptEdit(); } }} className="w-full bg-gray-700 text-gray-200 p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y" rows={Math.max(2, editingTranscript.text.split('\n').length)} autoFocus />
                        ) : (
                            <p onClick={() => handleEditTranscript(index, turn.text)} className="text-gray-300 whitespace-pre-wrap cursor-pointer hover:bg-gray-700/50 p-2 rounded-md">{turn.text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2"><ListIcon className="w-6 h-6"/>Summary</h2>
                  <div className="bg-gray-900/70 rounded-lg p-4 space-y-2">
                    {editingSection === 'summary' ? (
                        <textarea value={tempSummary} onChange={e => setTempSummary(e.target.value)} onBlur={handleSaveSection} onKeyDown={e => { if (e.key === 'Escape') { handleCancelSectionEdit(); } }} className="w-full bg-gray-700 text-gray-200 p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y" rows={Math.max(4, tempSummary.split('\n').length)} autoFocus />
                    ) : (
                        <div onClick={() => handleEditSection('summary')} className="text-gray-300 whitespace-pre-wrap cursor-pointer hover:bg-gray-700/50 p-2 rounded-md">
                            {analysisResult.summary.split('\n').map((line, i) => (<p key={i}>{line.startsWith('* ') ? `• ${line.substring(2)}` : line}</p>))}
                        </div>
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2"><CheckCircleIcon className="w-6 h-6"/>Action Items</h2>
                   <div className="bg-gray-900/70 rounded-lg p-4 space-y-2">
                      {editingSection === 'actionItems' ? (
                          <textarea value={tempActionItems} onChange={e => setTempActionItems(e.target.value)} onBlur={handleSaveSection} onKeyDown={e => { if (e.key === 'Escape') { handleCancelSectionEdit(); } }} className="w-full bg-gray-700 text-gray-200 p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y" rows={Math.max(4, tempActionItems.split('\n').length)} autoFocus />
                      ) : (
                          <div onClick={() => handleEditSection('actionItems')} className="text-gray-300 whitespace-pre-wrap cursor-pointer hover:bg-gray-700/50 p-2 rounded-md">
                              {analysisResult.actionItems.split('\n').map((line, i) => (<p key={i}>{line.startsWith('* ') ? `• ${line.substring(2)}` : line}</p>))}
                          </div>
                      )}
                  </div>
                </div>
            </div>
            <div className="mt-8 border-t border-gray-700 pt-6 space-y-4">
              <div className="flex flex-col items-center">
                <p className="text-center text-gray-400 mb-2">Not satisfied with the result? Try a different model.</p>
                <ModelSelector />
              </div>
              <div className="flex justify-center flex-wrap gap-4">
                <button onClick={handleSaveMeeting} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 flex items-center gap-2">
                  <SaveIcon className="w-5 h-5"/> Save Meeting
                </button>
                <button onClick={processAudio} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 flex items-center gap-2">
                  <RedoIcon className="w-5 h-5" /> Redo Analysis
                </button>
                <button onClick={handleResetAnalysis} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105">
                  Analyze Another
                </button>
              </div>
            </div>
        </>
      )}
    </>
  );

  const renderQaView = () => (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2"><ArchiveBoxIcon className="w-6 h-6"/>Select Meetings for Context</h2>
        <div className="bg-gray-900/70 rounded-lg p-4 max-h-[300px] overflow-y-auto space-y-2">
          {savedMeetings.length > 0 ? (
            savedMeetings.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(meeting => (
              <div key={meeting.id} className="flex items-center justify-between p-3 rounded-md hover:bg-gray-800/50 transition-colors">
                <label className="flex items-center gap-3 cursor-pointer flex-grow">
                  <input type="checkbox" checked={selectedMeetingIds.has(meeting.id)} onChange={() => handleToggleMeetingSelection(meeting.id)} className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-600"/>
                  <div>
                      <p className="font-semibold text-gray-200">{meeting.title}</p>
                      <p className="text-sm text-gray-400">{new Date(meeting.timestamp).toLocaleString()}</p>
                  </div>
                </label>
                <button onClick={() => handleDeleteMeeting(meeting.id)} className="text-gray-500 hover:text-red-400 transition-colors ml-4" aria-label={`Delete meeting ${meeting.title}`}><TrashIcon className="w-5 h-5"/></button>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-400 py-4">No saved meetings yet. Analyze a new meeting to get started.</p>
          )}
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2"><QuestionMarkCircleIcon className="w-6 h-6"/>Ask a Question</h2>
        <div className="bg-gray-900/70 rounded-lg p-4 space-y-4">
            <textarea value={qaQuestion} onChange={(e) => setQaQuestion(e.target.value)} placeholder="Ask about action items, decisions, or summaries from the selected meetings..." className="w-full bg-gray-800 text-gray-200 p-3 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500" rows={3}></textarea>
            <ModelSelector />
            <button onClick={handleAskQuestion} disabled={isAnswering || selectedMeetingIds.size === 0} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isAnswering ? <ProcessingIcon className="w-5 h-5"/> : <MicIcon className="w-5 h-5" />}
                {isAnswering ? 'Getting Answer...' : 'Ask AI Agent'}
            </button>
            {qaAnswer && (
                <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <h3 className="font-bold text-lg mb-2 text-emerald-400">Answer:</h3>
                    <p className="text-gray-300 whitespace-pre-wrap">{qaAnswer}</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            Meeting Diarization & Summarizer
          </h1>
          <p className="mt-2 text-lg text-gray-400">
            Your intelligent meeting archive.
          </p>
        </header>

        <nav className="flex justify-center bg-gray-800/50 rounded-full p-1 mb-8 border border-gray-700">
            <button onClick={() => setView('analyze')} className={`px-6 py-2 rounded-full font-semibold transition-colors ${view === 'analyze' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Analyze New Meeting</button>
            <button onClick={() => setView('qa')} className={`px-6 py-2 rounded-full font-semibold transition-colors ${view === 'qa' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Saved Meetings & Q&A</button>
        </nav>

        <main className="bg-gray-800/50 rounded-2xl shadow-2xl shadow-black/30 p-6 sm:p-8 backdrop-blur-sm border border-gray-700">
          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-center flex items-center justify-center gap-2">
                <XCircleIcon className="w-6 h-6 text-red-400" />
                <p className="font-semibold text-red-400">{error}</p>
            </div>
          )}
          {view === 'analyze' ? renderAnalysisView() : renderQaView()}
        </main>
      </div>
    </div>
  );
};

export default App;
