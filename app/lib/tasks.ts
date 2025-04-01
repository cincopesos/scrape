import { ChildProcessWithoutNullStreams } from 'child_process';

// Define task info structure
interface TaskInfo {
  process: ChildProcessWithoutNullStreams;
  startTime: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  details?: {
    url?: string;
    sessionId?: string;
  };
}

// In-memory task map
const tasks = new Map<string, TaskInfo>();

// Add a new task (corregido para aceptar 3 parámetros)
export function addTask(
  taskId: string, 
  process: ChildProcessWithoutNullStreams, 
  details?: { url?: string; sessionId?: string }
): void {
  console.log(`Task added: ${taskId}, Active tasks: ${tasks.size + 1}`);
  
  // Register the task with metadata
  tasks.set(taskId, {
    process,
    startTime: Date.now(),
    status: 'running',
    details
  });
  
  // Set up automatic cleanup if process exits/errors
  process.on('close', () => {
    const task = tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      console.log(`Task completed: ${taskId}, Active tasks: ${tasks.size}`);
    }
  });
  
  process.on('error', () => {
    const task = tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      console.log(`Task failed: ${taskId}, Active tasks: ${tasks.size}`);
    }
  });
}

// Get a task by ID
export function getTask(taskId: string): TaskInfo | undefined {
  const task = tasks.get(taskId);
  
  if (!task) {
    console.log(`Task not found: ${taskId}, Available tasks: ${tasks.size}`);
    if (tasks.size > 0) {
      console.log(`Available task IDs: ${Array.from(tasks.keys()).join(', ')}`);
    }
  } else {
    console.log(`Task found: ${taskId}, Status: ${task.status}`);
  }
  
  return task;
}

// Remove a task
export function removeTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (task) {
    // If process is still running, try to kill it
    try {
      if (task.process.exitCode === null && !task.process.killed) {
        task.process.kill();
        task.status = 'cancelled';
      }
    } catch (e) {
      console.error(`Error killing process for task ${taskId}:`, e);
    }
  }
  
  const result = tasks.delete(taskId);
  console.log(`Task removed: ${taskId}, Success: ${result}, Remaining tasks: ${tasks.size}`);
  return result;
}

// List all active tasks
export function listTasks(): { id: string; startTime: number; status: string }[] {
  const taskList = Array.from(tasks.entries()).map(([id, info]) => ({
    id,
    startTime: info.startTime,
    status: info.status
  }));
  
  console.log(`Current tasks (${taskList.length}): ${JSON.stringify(taskList)}`);
  return taskList;
}

// Get all task IDs as an array
export function getAllTaskIds(): string[] {
  return Array.from(tasks.keys());
} 