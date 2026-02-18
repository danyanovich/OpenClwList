'use client';

import { Plus } from 'lucide-react';

interface HeaderProps {
  onAddTask: () => void;
}

export function Header({ onAddTask }: HeaderProps) {
  return (
    <header className="bg-white border-b px-6 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-lg">OC</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">ClawProject</h1>
            <p className="text-xs text-gray-500">for OpenClaw AI Agents</p>
          </div>
        </div>
        <button
          onClick={onAddTask}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Добавить задачу</span>
          <span className="sm:hidden">Добавить</span>
        </button>
      </div>
    </header>
  );
}
