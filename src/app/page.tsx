'use client';

import { useState } from 'react';
import { Task, TaskStatus } from '@/types';
import { useStore, getTasksByStatus, getStatusLabel } from '@/store';
import { TaskCard } from '@/components/TaskCard';
import { Plus } from 'lucide-react';

const COLUMNS: TaskStatus[] = ['review', 'approved', 'sent', 'revision'];

export default function Home() {
  const { tasks, addTask, updateTask, deleteTask } = useStore();
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    company: '',
    content: '',
    link: '',
  });

  const handleAddTask = () => {
    if (newTask.title && newTask.company) {
      addTask({
        ...newTask,
        status: 'review',
        feedback: '',
      });
      setNewTask({ title: '', company: '', content: '', link: '' });
      setIsAddingTask(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">OC</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">ClawProject</h1>
              <p className="text-xs text-gray-500">for OpenClaw AI Agents</p>
            </div>
          </div>
          <button
            onClick={() => setIsAddingTask(!isAddingTask)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Добавить задачу
          </button>
        </div>
      </header>

      {/* Add Task Form */}
      {isAddingTask && (
        <div className="bg-white border-b p-6">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-lg font-semibold mb-4">Новая задача</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input
                type="text"
                placeholder="Название вакансии"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                className="border rounded-lg px-4 py-2"
              />
              <input
                type="text"
                placeholder="Компания"
                value={newTask.company}
                onChange={(e) => setNewTask({ ...newTask, company: e.target.value })}
                className="border rounded-lg px-4 py-2"
              />
              <input
                type="url"
                placeholder="Ссылка на вакансию"
                value={newTask.link}
                onChange={(e) => setNewTask({ ...newTask, link: e.target.value })}
                className="border rounded-lg px-4 py-2 md:col-span-2"
              />
              <textarea
                placeholder="Текст письма..."
                value={newTask.content}
                onChange={(e) => setNewTask({ ...newTask, content: e.target.value })}
                className="border rounded-lg px-4 py-2 md:col-span-2"
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddTask}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Добавить
              </button>
              <button
                onClick={() => setIsAddingTask(false)}
                className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-gray-500 text-sm">Всего задач</p>
            <p className="text-2xl font-bold">{tasks.length}</p>
          </div>
          {COLUMNS.map((status) => (
            <div key={status} className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-gray-500 text-sm">{getStatusLabel(status)}</p>
              <p className="text-2xl font-bold">{getTasksByStatus(tasks, status).length}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="max-w-7xl mx-auto px-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {COLUMNS.map((status) => {
            const columnTasks = getTasksByStatus(tasks, status);
            return (
              <div key={status} className="bg-gray-100 rounded-lg p-4">
                <h2 className="font-semibold mb-3 flex items-center justify-between">
                  {getStatusLabel(status)}
                  <span className="bg-gray-200 px-2 py-0.5 rounded text-sm">
                    {columnTasks.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onUpdate={updateTask}
                      onDelete={deleteTask}
                    />
                  ))}
                  {columnTasks.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">
                      Нет задач
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
