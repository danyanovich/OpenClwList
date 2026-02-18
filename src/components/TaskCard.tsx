'use client';

import { useState } from 'react';
import { Task, TaskStatus } from '@/types';
import { getStatusLabel, getStatusColor } from '@/store';
import { Edit2, Trash2, ExternalLink, MessageSquare } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

export function TaskCard({ task, onUpdate, onDelete }: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedback, setFeedback] = useState(task.feedback);

  const handleStatusChange = (newStatus: TaskStatus) => {
    onUpdate(task.id, { status: newStatus });
  };

  const handleFeedbackSave = () => {
    onUpdate(task.id, { feedback });
  };

  return (
    <div className={`border-l-4 rounded-lg bg-white shadow-sm p-4 ${getStatusColor(task.status)}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg">{task.title}</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 hover:bg-red-100 rounded text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-gray-600 text-sm mb-2">{task.company}</p>

      {task.link && (
        <a
          href={task.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 text-sm flex items-center gap-1 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Ссылка на вакансию
        </a>
      )}

      {/* Status buttons */}
      <div className="flex flex-wrap gap-1 mt-3">
        {(['review', 'approved', 'sent', 'revision'] as TaskStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            className={`px-2 py-1 text-xs rounded ${
              task.status === status
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {getStatusLabel(status)}
          </button>
        ))}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{task.content}</p>
          
          <div className="mt-3">
            <label className="text-sm font-medium flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              Фитбек
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onBlur={handleFeedbackSave}
              placeholder="Напиши фитбек..."
              className="w-full mt-1 p-2 border rounded text-sm"
              rows={3}
            />
          </div>

          <p className="text-xs text-gray-400 mt-2">
            Создано: {new Date(task.createdAt).toLocaleDateString('ru-RU')}
          </p>
        </div>
      )}
    </div>
  );
}
