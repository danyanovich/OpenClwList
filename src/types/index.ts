export type TaskStatus = 'review' | 'approved' | 'sent' | 'revision';

export interface Task {
  id: string;
  title: string;
  company: string;
  content: string;
  link?: string;
  status: TaskStatus;
  feedback: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  tasks: string[]; // task IDs
  createdAt: string;
}

export interface AppState {
  tasks: Task[];
  projects: Project[];
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
}
