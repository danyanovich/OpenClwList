'use client';

import { Task, TaskStatus } from '@/types';
import { getTasksByStatus, getStatusLabel } from '@/store';

const STATUSES: TaskStatus[] = ['review', 'approved', 'sent', 'revision'];

const STATUS_ACCENT: Record<TaskStatus, string> = {
  review: 'text-yellow-600',
  approved: 'text-green-600',
  sent: 'text-blue-600',
  revision: 'text-red-600',
};

interface StatsBarProps {
  tasks: Task[];
}

export function StatsBar({ tasks }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <p className="text-gray-500 text-xs mb-1">Всего задач</p>
        <p className="text-2xl font-bold text-gray-800">{tasks.length}</p>
      </div>
      {STATUSES.map((status) => (
        <div key={status} className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">{getStatusLabel(status)}</p>
          <p className={`text-2xl font-bold ${STATUS_ACCENT[status]}`}>
            {getTasksByStatus(tasks, status).length}
          </p>
        </div>
      ))}
    </div>
  );
}
