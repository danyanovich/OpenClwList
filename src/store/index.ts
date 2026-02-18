import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppState, Task, Project, TaskStatus } from '@/types';

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      tasks: [],
      projects: [],

      addTask: (taskData) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              ...taskData,
              id: `task-${Date.now()}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        })),

      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id
              ? { ...task, ...updates, updatedAt: new Date().toISOString() }
              : task
          ),
        })),

      deleteTask: (id) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
        })),

      addProject: (projectData) =>
        set((state) => ({
          projects: [
            ...state.projects,
            {
              ...projectData,
              id: `project-${Date.now()}`,
              createdAt: new Date().toISOString(),
            },
          ],
        })),

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === id ? { ...project, ...updates } : project
          ),
        })),

      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== id),
        })),
    }),
    {
      name: 'clawproject-storage',
    }
  )
);

// Helper functions
export const getTasksByStatus = (tasks: Task[], status: TaskStatus): Task[] =>
  tasks.filter((task) => task.status === status);

export const getStatusLabel = (status: TaskStatus): string => {
  const labels: Record<TaskStatus, string> = {
    review: 'На проверке',
    approved: 'Одобрено',
    sent: 'Отправлено',
    revision: 'На доработке',
  };
  return labels[status];
};

export const getStatusColor = (status: TaskStatus): string => {
  const colors: Record<TaskStatus, string> = {
    review: 'bg-yellow-100 border-yellow-400',
    approved: 'bg-green-100 border-green-400',
    sent: 'bg-blue-100 border-blue-400',
    revision: 'bg-red-100 border-red-400',
  };
  return colors[status];
};
