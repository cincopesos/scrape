'use client';

import { useState, useEffect, useRef } from 'react';

// Define a more specific type for the results based on expected script output
interface ScrapeResult {
  url: string;
  title: string;
  markdown_preview: string;
}

interface ScrapeSummary {
    total_urls_input: number;
    successful_scrapes: number;
    failed_scrapes: number;
    restored_from_checkpoint?: boolean;
    peak_memory_mb?: number | null; // Optional
}

interface ScrapeResponse {
  success: ScrapeResult[];
  failed: string[];
  errors: { url: string; error: string }[];
  summary: ScrapeSummary;
  // Add top-level error field if script itself fails
  error?: string;
  details?: string;
}

// --- Types for SSE Data (align with Python script) ---
interface SuccessData {
  url: string;
  title: string;
  preview?: string;
  time?: string;
  status?: string;
}

interface FailData {
  url: string;
  error: string;
  time?: string;
  status?: string;
}

interface ProgressData {
  processed: number;
  total: number;
  success: number;
  failed: number;
  percent_complete: number;
}

interface RestoreProgressData {
  already_processed: number;
  success: number;
  failed: number;
}

interface SummaryData {
  total_urls_input: number;
  successful_scrapes: number;
  failed_scrapes: number;
  restored_from_checkpoint?: boolean;
  peak_memory_mb?: number | null;
}

// Type for generic SSE message structure
interface SseMessage {
  type: string; // e.g., STATUS, FOUND_URL, SUCCESS, FAIL, SUMMARY, END, ERROR
  data: any;
}

// --- Component State ---
interface ScraperState {
  taskId: string | null;
  sessionId: string | null;
  isRunning: boolean;
  status: string; // General status messages
  foundUrls: string[];
  successfulScrapes: SuccessData[];
  failedScrapes: FailData[];
  summary: SummaryData | null;
  error: string | null;
  progress: ProgressData | null;
  restored: RestoreProgressData | null;
  startTime: number | null;
}

const initialState: ScraperState = {
  taskId: null,
  sessionId: null,
  isRunning: false,
  status: 'Idle',
  foundUrls: [],
  successfulScrapes: [],
  failedScrapes: [],
  summary: null,
  error: null,
  progress: null,
  restored: null,
  startTime: null,
};

export default function SitemapScraper() {
  const [urlInput, setUrlInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveEnabled, setSaveEnabled] = useState(true);
  const [state, setState] = useState<ScraperState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);

  // --- Event Source Management ---
  const connectEventSource = (taskId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close(); // Close existing connection if any
    }

    const eventSource = new EventSource(`/api/scrape/stream/${taskId}`);
    eventSourceRef.current = eventSource;

    setState(prev => ({ 
      ...prev, 
      isRunning: true, 
      status: 'Connecting to stream...', 
      error: null,
      startTime: Date.now()
    }));

    eventSource.onopen = () => {
      console.log('SSE Connection Opened');
      setState(prev => ({ ...prev, status: 'Stream connected, waiting for data...' }));
    };

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      setState(prev => ({ ...prev, error: 'Stream connection failed or closed unexpectedly.', isRunning: false }));
      eventSource.close();
      eventSourceRef.current = null;
    };
    
    // Generic message handler (parses JSON data)
    eventSource.onmessage = (event) => {
        try {
             const messageData = JSON.parse(event.data);
             console.log('Generic SSE Message:', messageData);
             // Handle system messages or unexpected formats
             if (messageData.type === 'SYSTEM') {
                  setState(prev => ({ ...prev, status: messageData.message || 'System message received.'}));
             }
         } catch (e) {
             console.warn('Could not parse generic SSE message data:', event.data, e);
         }
    };

    // Specific event handlers based on Python script's SSE types
    const addEventHandler = (eventType: string, handler: (data: any) => void) => {
      eventSource.addEventListener(eventType, (event) => {
        try {
          const parsedData = JSON.parse(event.data);
          handler(parsedData);
        } catch (e) {
          console.error(`Error parsing SSE event [${eventType}]:`, event.data, e);
        }
      });
    };

    addEventHandler('START', (data) => {
      setState(prev => ({ 
        ...prev, 
        sessionId: data.session_id || null,
        status: `Scraper initiated at ${new Date().toLocaleTimeString()}` 
      }));
    });
    
    addEventHandler('STATUS', (data) => setState(prev => ({ ...prev, status: typeof data === 'string' ? data : JSON.stringify(data) })) );
    addEventHandler('FOUND_URL', (data) => setState(prev => ({ ...prev, foundUrls: [...prev.foundUrls, data as string] })) );
    addEventHandler('SUCCESS', (data) => setState(prev => ({ ...prev, successfulScrapes: [...prev.successfulScrapes, data as SuccessData] })) );
    addEventHandler('FAIL', (data) => setState(prev => ({ ...prev, failedScrapes: [...prev.failedScrapes, data as FailData] })) );
    addEventHandler('WARN', (data) => setState(prev => ({ ...prev, status: `Warning: ${data}` })) );
    addEventHandler('ERROR', (data) => setState(prev => ({ ...prev, error: `Script Error: ${JSON.stringify(data)}`, status: 'Error occurred.' })) );
    
    addEventHandler('PROGRESS_UPDATE', (data) => {
      setState(prev => ({ 
        ...prev, 
        progress: data as ProgressData
      }));
    });
    
    addEventHandler('RESTORE_PROGRESS', (data) => {
      setState(prev => ({ 
        ...prev, 
        restored: data as RestoreProgressData,
        status: `Restored ${data.already_processed} URLs from previous run (${data.success} successful, ${data.failed} failed)`
      }));
    });
    
    addEventHandler('CANCELLED', (data) => setState(prev => ({ ...prev, status: `Process Cancelled: ${data}`, isRunning: false })) );
    addEventHandler('SUMMARY', (data) => setState(prev => ({ ...prev, summary: data as SummaryData })) );
    
    addEventHandler('END', (data) => {
        setState(prev => ({ ...prev, status: `Finished: ${data}`, isRunning: false }));
        console.log('SSE Stream END received');
        eventSource.close();
        eventSourceRef.current = null;
    });

  };

  // Cleanup event source on component unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        console.log("Closing SSE connection on component unmount");
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Calculate elapsed time
  const getElapsedTime = () => {
    if (!state.startTime) return '';
    const seconds = Math.floor((Date.now() - state.startTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Calculate estimated time remaining
  const getEta = () => {
    if (!state.progress || !state.startTime) return '';
    if (state.progress.percent_complete <= 0) return 'Calculating...';
    
    const elapsed = (Date.now() - state.startTime) / 1000;
    const totalEstimated = elapsed / (state.progress.percent_complete / 100);
    const remaining = totalEstimated - elapsed;
    
    if (remaining < 60) return `${Math.round(remaining)}s`;
    if (remaining < 3600) return `${Math.round(remaining / 60)}m`;
    return `${Math.round(remaining / 3600)}h ${Math.round((remaining % 3600) / 60)}m`;
  };

  // --- Button Handlers ---
  const handleStartScrape = async () => {
    if (!urlInput || state.isRunning) return;

    // Reset state before starting new scrape
    setState({...initialState, startTime: Date.now()});
    console.log('Starting scrape for:', urlInput);

    try {
      // Call the new /start endpoint
      const response = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: urlInput,
          save_files: saveEnabled
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API /start failed with status ${response.status}`);
      }

      if (data.taskId) {
        console.log('Received taskId:', data.taskId);
        setState(prev => ({ ...prev, taskId: data.taskId }));
        connectEventSource(data.taskId); // Connect to the SSE stream
      } else {
         throw new Error('No taskId received from /start endpoint');
      }

    } catch (err: any) {
       console.error('Failed to start scrape:', err);
       setState(prev => ({ ...prev, error: err.message || 'Failed to initiate scraping.', isRunning: false }));
    }
  };

  const handleCancelScrape = async () => {
    if (!state.taskId || !state.isRunning) return;

    console.log('Cancelling task:', state.taskId);
    setState(prev => ({ ...prev, status: 'Sending cancellation signal...'}));

    try {
       const response = await fetch('/api/scrape/cancel', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({ taskId: state.taskId }),
       });

       const data = await response.json();

       if (!response.ok) {
         // Even if API fails, might have been cancelled already, update UI
         console.warn('Cancel API failed:', data.error || response.statusText);
         setState(prev => ({ ...prev, status: `Failed to send cancel signal (${data.error || 'unknown reason'}). Process might still be running or already stopped.`, isRunning: false })); // Assume stopped or error
       } else {
         setState(prev => ({ ...prev, status: 'Cancellation signal sent. Waiting for process termination...'}));
         // The 'CANCELLED' or 'END' SSE event will confirm termination
       }
       // Optionally close EventSource immediately after sending cancel?
       // if (eventSourceRef.current) eventSourceRef.current.close();

    } catch (err: any) {
       console.error('Failed to cancel scrape:', err);
       setState(prev => ({ ...prev, error: err.message || 'Failed to send cancellation request.', status: 'Cancellation request failed.', isRunning: false }));
    }

  };

  // --- Render Logic ---
  const { 
     isRunning, 
     status, 
     foundUrls, 
     successfulScrapes, 
     failedScrapes, 
     summary, 
     error,
     progress,
     restored,
     sessionId
  } = state;

  return (
    <div className="container mx-auto p-4 max-w-4xl flex flex-col gap-4"> {/* Added flex-col and gap */} 
      <h1 className="text-2xl font-bold text-center">Sitemap URL Analyzer (Real-time)</h1>
      
      {/* Input and Controls */} 
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter sitemap URL (e.g., https://example.com/sitemap.xml)"
          className="flex-grow p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black disabled:bg-gray-100" 
          disabled={isRunning}
        />
        {!isRunning ? (
          <button
            onClick={handleStartScrape}
            disabled={!urlInput || isRunning}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Start Scraping
          </button>
        ) : (
          <button
            onClick={handleCancelScrape}
            disabled={!isRunning} // Only enable when running
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md shrink-0"
          >
             <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
             Cancel Scraping
          </button>
        )}
      </div>
      
      {/* Advanced Options */}
      <div className="flex items-center">
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-blue-600 hover:underline"
        >
          {showAdvanced ? '- Hide advanced options' : '+ Show advanced options'}
        </button>
      </div>
      
      {showAdvanced && (
        <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
          <h2 className="text-sm font-semibold mb-2">Advanced Options</h2>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="saveEnabled"
              checked={saveEnabled}
              onChange={(e) => setSaveEnabled(e.target.checked)}
              disabled={isRunning}
              className="h-4 w-4"
            />
            <label htmlFor="saveEnabled" className="text-sm">
              Save content to local files (enables checkpoints/resumption)
            </label>
          </div>
          
          {sessionId && (
            <div className="mt-2 bg-gray-100 p-2 rounded text-xs">
              <div>Session ID: <span className="font-mono">{sessionId}</span></div>
              <div className="text-gray-500 text-xs mt-1">
                You can resume this session later by passing this ID to the command line (advanced).
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status and Error Display */} 
      <div className="p-3 border border-gray-200 rounded-lg bg-gray-50"> 
          <h2 className="text-lg font-semibold mb-1 text-gray-700">Status</h2>
          <p className={`text-sm ${error ? 'text-red-600' : 'text-gray-800'}`}>{error ? `Error: ${error}` : status}</p>
          
          {/* Progress Bar */}
          {progress && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Progress: {progress.percent_complete.toFixed(1)}%</span>
                <span>
                  Elapsed: {getElapsedTime()} 
                  {progress.percent_complete > 0 && ` | ETA: ~${getEta()}`}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${progress.percent_complete}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>Processed: {progress.processed}/{progress.total}</span>
                <span>Success: {progress.success} | Failed: {progress.failed}</span>
              </div>
            </div>
          )}
          
          {/* Restored from checkpoint */}
          {restored && (
            <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
              Restored {restored.already_processed} URLs from previous checkpoint 
              ({restored.success} successful, {restored.failed} failed).
              Resuming from where processing left off.
            </div>
          )}
      </div>

      {/* Real-time Results Area */} 
      {(foundUrls.length > 0 || successfulScrapes.length > 0 || failedScrapes.length > 0 || summary) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Found URLs */} 
          <div className="border border-gray-200 rounded-lg bg-white p-3">
             <h3 className="text-md font-semibold mb-2 text-gray-700">Found URLs ({foundUrls.length})</h3>
             <ul className="list-disc list-inside max-h-60 overflow-y-auto text-xs space-y-1">
               {foundUrls.map((url, index) => (
                 <li key={index} className="text-gray-600 break-all">{url}</li>
               ))}
             </ul>
          </div>

          {/* Successful Scrapes */} 
           <div className="border border-gray-200 rounded-lg bg-white p-3">
             <h3 className="text-md font-semibold mb-2 text-green-700">Successful ({successfulScrapes.length})</h3>
              <ul className="list-disc list-inside max-h-60 overflow-y-auto text-xs space-y-1">
                {successfulScrapes.map((item, index) => (
                  <li key={index} className={`text-gray-800 break-all ${item.status === 'restored' ? 'bg-green-50 p-1 rounded' : ''}`}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {item.url.length > 40 ? item.url.substring(0, 40) + '...' : item.url}
                    </a>
                    {item.title && <span className="text-gray-500 block"> - {item.title}</span>}
                    {item.preview && <span className="text-gray-400 block text-xxs mt-1">{item.preview}</span>}
                    {item.time && <span className="text-gray-400 text-xxs block">Processed at: {item.time}</span>}
                  </li>
                ))}
              </ul>
          </div>

           {/* Failed Scrapes */} 
           <div className="border border-gray-200 rounded-lg bg-white p-3">
             <h3 className="text-md font-semibold mb-2 text-red-700">Failed ({failedScrapes.length})</h3>
              <ul className="list-disc list-inside max-h-60 overflow-y-auto text-xs space-y-1">
                {failedScrapes.map((item, index) => (
                  <li key={index} className={`text-red-800 break-all ${item.status === 'restored' ? 'bg-red-50 p-1 rounded' : ''}`}>
                    {item.url.length > 40 ? item.url.substring(0, 40) + '...' : item.url}
                    {item.error && <span className="text-red-600 block text-xxs"> - {item.error}</span>}
                    {item.time && <span className="text-gray-400 text-xxs block">Error at: {item.time}</span>}
                  </li>
                ))}
              </ul>
          </div>

        </div>
      )}

       {/* Final Summary */} 
       {summary && !isRunning && (
         <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-green-50">
            <h2 className="text-lg font-semibold mb-2 text-green-800">Final Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div className="p-2 bg-blue-100 rounded">
                     <div className="text-xs text-blue-700">Total URLs Input</div>
                     <div className="text-xl font-bold text-blue-900">{summary.total_urls_input ?? 'N/A'}</div>
                 </div>
                 <div className="p-2 bg-green-100 rounded">
                     <div className="text-xs text-green-700">Successful</div>
                     <div className="text-xl font-bold text-green-900">{summary.successful_scrapes ?? 'N/A'}</div>
                 </div>
                 <div className="p-2 bg-red-100 rounded">
                     <div className="text-xs text-red-700">Failed</div>
                     <div className="text-xl font-bold text-red-900">{summary.failed_scrapes ?? 'N/A'}</div>
                 </div>
             </div>
              {summary.restored_from_checkpoint && (
                <p className="text-sm text-green-700 mt-3 text-center font-semibold">
                  ✓ Used checkpoint data from previous run
                </p>
              )}
              {summary.peak_memory_mb && (
                 <p className="text-xs text-gray-600 mt-2 text-center">Peak Memory: {summary.peak_memory_mb} MB</p>
             )}
         </div>
       )}

    </div>
  );
} 