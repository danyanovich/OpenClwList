'use client';

import { useState } from 'react';
import { Task } from '@/types';
import { useStore } from '@/store';
import { Header } from '@/components/Header';
import { StatsBar } from '@/components/StatsBar';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskModal } from '@/components/TaskModal';

export default function Home() {
  const { tasks, addTask, updateTask, deleteTask } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const handleSave = (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'feedback'>) => {
    if (editingTask) {
      updateTask(editingTask.id, data);
    } else {
      addTask({ ...data, status: 'review', feedback: '' });
    }
    handleModalClose();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onAddTask={() => setIsModalOpen(true)} />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <StatsBar tasks={tasks} />
        <KanbanBoard
          tasks={tasks}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      </main>

      {(isModalOpen || editingTask) && (
        <TaskModal
          task={editingTask ?? undefined}
          onSave={handleSave}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
