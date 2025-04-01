import { ChildProcessWithoutNullStreams } from 'child_process';

interface ActiveTask {
  process: ChildProcessWithoutNullStreams;
  // Optional: Store stdout/stderr streams if needed separately
}

// Simple in-memory store for active tasks. 
// NOTE: This will not persist across server restarts and is not suitable for production scaling.
const activeTasks = new Map<string, ActiveTask>();

export const addTask = (taskId: string, process: ChildProcessWithoutNullStreams) => {
  activeTasks.set(taskId, { process });
  console.log(`Task added: ${taskId}, Active tasks: ${activeTasks.size}`);
};

export const getTask = (taskId: string): ActiveTask | undefined => {
  return activeTasks.get(taskId);
};

export const removeTask = (taskId: string) => {
  const deleted = activeTasks.delete(taskId);
  if (deleted) {
    console.log(`Task removed: ${taskId}, Active tasks: ${activeTasks.size}`);
  } else {
     console.warn(`Attempted to remove non-existent task: ${taskId}`);
  }
  return deleted;
};

export const listActiveTasks = (): string[] => {
    return Array.from(activeTasks.keys());
}; 