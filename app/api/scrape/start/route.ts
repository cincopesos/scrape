import { NextResponse } from 'next/server';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { addTask, removeTask } from '@/lib/tasks'; // Corregido: eliminado getAllTaskIds
import fs from 'fs';

export async function POST(request: Request) {
  try {
    const { url, save_files = true, session_id = null } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const taskId = crypto.randomUUID(); // Generate unique task ID
    const currentSessionId = session_id || `session_${Date.now()}`;

    // --- Configuration (same as before) ---
    const scriptPath = path.join(process.cwd(), 'scripts', 'scrape.py');
    const pythonExecutable = '/Users/fabiansepulvedalopez/Desktop/saas-projects/scrape/.venv/bin/python3'; // Absolute path
    // --- End Configuration ---

    console.log(`[${taskId}] Starting scrape for URL: ${url}`);
    console.log(`[${taskId}] Session ID: ${currentSessionId}, Save Files: ${save_files}`);
    console.log(`[${taskId}] Executing: ${pythonExecutable} ${scriptPath} ${url}`);

    if (!fs.existsSync(scriptPath)) {
      console.error(`[${taskId}] Script not found: ${scriptPath}`);
      return NextResponse.json({ error: 'Script file not found on server.' }, { status: 500 });
    }
     if (!fs.existsSync(pythonExecutable)) {
      console.error(`[${taskId}] Python executable not found: ${pythonExecutable}`);
      return NextResponse.json({ error: 'Python executable not found on server.' }, { status: 500 });
    }

    // Build command arguments based on options
    const args = [
      scriptPath,
      url,
      // Use 'both' to both stream SSE events and save files if enabled
      '--output-format', save_files ? 'both' : 'sse',
      // Always pass session ID for tracking and potential resumption
      '--session-id', currentSessionId,
      // Add verbosity for better debugging
      '-v'
    ];

    console.log(`[${taskId}] Full command: ${pythonExecutable} ${args.join(' ')}`);

    const scraperProcess = spawn(pythonExecutable, args);

    // Add the process to our task manager with additional details
    addTask(taskId, scraperProcess, {
      url,
      sessionId: currentSessionId
    });
    
    // Ya no usamos getAllTaskIds() porque no está disponible
    console.log(`[${taskId}] Task registered successfully`);

    // Handle process exit/close - IMPORTANT to clean up tasks
    scraperProcess.on('close', (code) => {
      console.log(`[${taskId}] Process exited with code ${code}`);
      // removeTask is now handled by the task manager
    });

    scraperProcess.on('error', (err) => {
      console.error(`[${taskId}] Failed to start subprocess:`, err);
      // removeTask is now handled by the task manager
    });

    // Log stderr for debugging purposes (Python script logs/errors)
    scraperProcess.stderr.on('data', (data) => {
      console.error(`[${taskId}] Script stderr: ${data.toString().trim()}`);
    });

    // Add a small delay before responding to ensure task is registered
    await new Promise(resolve => setTimeout(resolve, 100));

    // Respond immediately with the taskId and sessionId for reference
    return NextResponse.json({ 
      taskId,
      sessionId: currentSessionId,
      saveFiles: save_files
    });

  } catch (error: any) {
    console.error('[API /start Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error in /start route', details: error.message }, { status: 500 });
  }
} 