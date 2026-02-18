'use client';

import { useState } from 'react';
import { Task } from '@/types';
import { getStatusColor } from '@/store';
import { formatDate } from '@/lib/utils';
import { FeedbackInput } from './FeedbackInput';
import { TaskModal } from './TaskModal';
import { Edit2, Trash2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
  isDragging?: boolean;
}

export function TaskCard({ task, onUpdate, onDelete, isDragging }: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedback, setFeedback] = useState(task.feedback);
  const [isEditing, setIsEditing] = useState(false);

  const handleFeedbackSave = () => {
    onUpdate(task.id, { feedback });
  };

  return (
    <>
      <div
        className={`border-l-4 rounded-lg bg-white shadow-sm p-4 ${getStatusColor(task.status)} ${
          isDragging ? 'shadow-lg rotate-1 opacity-90' : ''
        }`}
      >
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-semibold text-sm leading-snug flex-1 mr-2">{task.title}</h3>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 hover:bg-gray-100 rounded"
              title="Редактировать"
            >
              <Edit2 className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-1 hover:bg-red-100 rounded"
              title="Удалить"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-gray-100 rounded"
              title={isExpanded ? 'Свернуть' : 'Развернуть'}
            >
              {isExpanded
                ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              }
            </button>
          </div>
        </div>

        <p className="text-gray-500 text-xs mb-2">{task.company}</p>

        {task.link && (
          <a
            href={task.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 text-xs flex items-center gap-1 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Открыть ссылку
          </a>
        )}

        {isExpanded && (
          <div className="mt-3 pt-3 border-t">
            {task.content && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{task.content}</p>
            )}

            <FeedbackInput
              value={feedback}
              onChange={setFeedback}
              onSave={handleFeedbackSave}
            />

            <p className="text-xs text-gray-400 mt-2">
              Создано: {formatDate(task.createdAt)}
            </p>
          </div>
        )}
      </div>

      {isEditing && (
        <TaskModal
          task={task}
          onSave={(data) => {
            onUpdate(task.id, data);
            setIsEditing(false);
          }}
          onClose={() => setIsEditing(false)}
        />
      )}
    </>
  );
}
