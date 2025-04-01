import { NextResponse } from 'next/server';
import { getTask, removeTask } from '@/lib/tasks'; // Import task management functions

export async function POST(request: Request) {
  try {
    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    console.log(`[${taskId}] Cancellation requested.`);

    const taskInfo = getTask(taskId);

    if (!taskInfo) {
      console.log(`[${taskId}] Task not found for cancellation.`);
      // Already stopped or never existed - return success potentially?
      return NextResponse.json({ message: 'Task not found or already stopped.'}, { status: 404 }); 
    }

    const process = taskInfo.process;

    if (process.killed) {
        console.log(`[${taskId}] Process already killed.`);
        removeTask(taskId); // Ensure cleanup if somehow still in map
        return NextResponse.json({ message: 'Process already stopped.' });
    }

    // Send SIGTERM signal to the process
    // The Python script should catch this and attempt to shut down gracefully.
    const killed = process.kill('SIGTERM'); 

    if (killed) {
        console.log(`[${taskId}] SIGTERM signal sent successfully.`);
        // Note: Process might take a moment to actually exit. 
        // The 'close' event handler in the /start route handles removing the task.
        // We can optimistically remove here, or rely on the close handler.
        // removeTask(taskId); 
        return NextResponse.json({ message: 'Cancellation signal sent.' });
    } else {
        console.error(`[${taskId}] Failed to send SIGTERM signal.`);
        // Attempt SIGKILL as a fallback?
        // const forceKilled = process.kill('SIGKILL');
        // console.log(`[${taskId}] Attempting SIGKILL... Success: ${forceKilled}`);
        // removeTask(taskId);
        return NextResponse.json({ error: 'Failed to send cancellation signal.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[API /cancel Error]:', error);
    // Attempt to get taskId for logging if parsing failed mid-request
    let taskIdForLog = 'unknown';
    try {
        const maybeBody = await request.clone().json();
        taskIdForLog = maybeBody?.taskId || 'unknown';
    } catch {}
    console.error(`[${taskIdForLog}] Error during cancellation:`, error);
    return NextResponse.json({ error: 'Internal Server Error in /cancel route', details: error.message }, { status: 500 });
  }
} 