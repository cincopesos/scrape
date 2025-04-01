import { NextRequest } from 'next/server';
import { getTask, removeTask } from '@/lib/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper to create SSE data strings
const formatSSE = (event: string, data: any): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

// Helper to create simple message SSE data strings
const formatMessageSSE = (data: any): string => {
  return `data: ${JSON.stringify(data)}\n\n`;
};

// Rate limiter to prevent too many events
class RateLimiter {
  private lastEventTime: number = 0;
  private MIN_EVENT_INTERVAL_MS = 50; // Minimum 50ms between events

  canSendEvent(): boolean {
    const now = Date.now();
    if (now - this.lastEventTime >= this.MIN_EVENT_INTERVAL_MS) {
      this.lastEventTime = now;
      return true;
    }
    return false;
  }
}

// Esta es la solución para tratar con params en Next.js correctamente
export const GET = async (
  request: NextRequest,
  { params }: { params: { taskId: string } }
) => {
  // Extract taskId from params - make sure to await using try/catch
  let taskId: string;
  try {
    // Esto resuelve el problema con params en Next.js
    taskId = params.taskId;
    console.log(`[${taskId}] SSE connection requested`);
  } catch (error) {
    console.error('Error accessing params:', error);
    return new Response(
      JSON.stringify({ error: 'Invalid task ID parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Create a new response with ReadableStream
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          console.log(`[${taskId}] SSE stream starting`);
          
          // Add a slight delay to ensure task registration is complete
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Get the task info
          const taskInfo = getTask(taskId);
          
          // Check if task exists
          if (!taskInfo) {
            console.log(`[${taskId}] Task not found for SSE stream`);
            controller.enqueue(formatSSE('ERROR', `Task ${taskId} not found`));
            controller.close();
            return;
          }
          
          const process = taskInfo.process;
          let streamClosed = false;
          
          // Rate limiter to prevent flooding
          const rateLimiter = new RateLimiter();
          
          // Send connection established message
          controller.enqueue(formatSSE('SYSTEM', 'SSE connection established'));
          
          // --- Process stdout data handler ---
          const handleStdout = (data: Buffer) => {
            if (streamClosed) return;
            
            try {
              const lines = data.toString().split('\n');
              
              for (const line of lines) {
                if (streamClosed) break;
                if (!line.trim()) continue;
                
                // Apply rate limiting except for END events
                if (!rateLimiter.canSendEvent() && !line.includes('END')) continue;
                
                // Process SSE_DATA messages
                if (line.startsWith('SSE_DATA:')) {
                  try {
                    const content = line.substring('SSE_DATA:'.length);
                    const eventTypeEndIndex = content.indexOf(':');
                    
                    if (eventTypeEndIndex > 0) {
                      const eventType = content.substring(0, eventTypeEndIndex);
                      const eventData = content.substring(eventTypeEndIndex + 1);
                      
                      try {
                        // Parse JSON when possible
                        let parsedData: any = eventData;
                        if ((eventData.startsWith('{') && eventData.endsWith('}')) || 
                            (eventData.startsWith('[') && eventData.endsWith(']'))) {
                          parsedData = JSON.parse(eventData);
                        }
                        
                        if (!streamClosed) {
                          // Critical check to avoid "Controller is already closed" error
                          try {
                            const dataStr = typeof parsedData === 'object' 
                              ? JSON.stringify(parsedData) 
                              : JSON.stringify(parsedData);
                            
                            const eventStr = `event: ${eventType}\ndata: ${dataStr}\n\n`;
                            controller.enqueue(eventStr);
                            
                            // If this is a terminal event, mark the stream as closing soon
                            if (eventType === 'END' || eventType === 'CANCELLED') {
                              console.log(`[${taskId}] Terminal event received: ${eventType}`);
                              setTimeout(() => {
                                if (!streamClosed) {
                                  streamClosed = true;
                                  try {
                                    controller.close();
                                  } catch (closeError) {
                                    console.error(`[${taskId}] Error closing controller:`, closeError);
                                  }
                                }
                              }, 1000); // Give time for browser to receive
                            }
                          } catch (enqueueError) {
                            console.error(`[${taskId}] Error enqueueing event:`, enqueueError);
                            // Don't try to enqueue more if we've hit an error
                            if (enqueueError.message.includes('Controller is already closed')) {
                              streamClosed = true;
                            }
                          }
                        }
                      } catch (parseError) {
                        console.error(`[${taskId}] Parse error:`, parseError);
                        // If controller is not closed, try to send error
                        if (!streamClosed) {
                          try {
                            controller.enqueue(formatSSE('ERROR', 'Failed to parse event data'));
                          } catch (e) {
                            // Ignore errors when trying to send error message
                            streamClosed = true; 
                          }
                        }
                      }
                    }
                  } catch (lineError) {
                    console.error(`[${taskId}] Line processing error:`, lineError);
                  }
                }
              }
            } catch (stdoutError) {
              console.error(`[${taskId}] Stdout handler error:`, stdoutError);
            }
          };
          
          // --- Process close handler ---
          const handleClose = (code: number | null) => {
            console.log(`[${taskId}] Process closed with code ${code}`);
            
            if (!streamClosed) {
              try {
                controller.enqueue(formatSSE('END', `Process finished with code ${code ?? 'unknown'}`));
                streamClosed = true;
                controller.close();
              } catch (e) {
                console.error(`[${taskId}] Error during stream closure:`, e);
              }
              
              // Clean up task
              removeTask(taskId);
              
              // Remove event listeners
              try {
                process.stdout.removeListener('data', handleStdout);
                process.removeListener('close', handleClose);
                process.removeListener('error', handleError);
              } catch (e) {
                console.error(`[${taskId}] Error detaching listeners:`, e);
              }
            }
          };
          
          // --- Process error handler ---
          const handleError = (err: Error) => {
            console.error(`[${taskId}] Process error:`, err);
            
            if (!streamClosed) {
              try {
                controller.enqueue(formatSSE('ERROR', `Process error: ${err.message}`));
                streamClosed = true;
                controller.close();
              } catch (e) {
                console.error(`[${taskId}] Error sending error event:`, e);
              }
              
              // Clean up task
              removeTask(taskId);
              
              // Remove event listeners
              try {
                process.stdout.removeListener('data', handleStdout);
                process.removeListener('close', handleClose);
                process.removeListener('error', handleError);
              } catch (e) {
                console.error(`[${taskId}] Error detaching listeners:`, e);
              }
            }
          };
          
          // Attach event listeners
          process.stdout.on('data', handleStdout);
          process.on('close', handleClose);
          process.on('error', handleError);
          
          // Check if process already exited
          if (process.exitCode !== null) {
            handleClose(process.exitCode);
          }
        } catch (error) {
          console.error(`[${taskId}] Fatal stream error:`, error);
          controller.enqueue(formatSSE('ERROR', `Fatal error: ${error instanceof Error ? error.message : String(error)}`));
          controller.close();
        }
      },
      
      cancel() {
        console.log(`[${taskId}] SSE stream cancelled by client`);
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    }
  );
}; 