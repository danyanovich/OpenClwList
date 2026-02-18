'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Task, TaskStatus } from '@/types';
import { getStatusLabel } from '@/store';
import { TaskCard } from './TaskCard';

const COLUMN_HEADER_COLOR: Record<TaskStatus, string> = {
  review: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  approved: 'bg-green-100 text-green-800 border-green-300',
  sent: 'bg-blue-100 text-blue-800 border-blue-300',
  revision: 'bg-red-100 text-red-800 border-red-300',
};

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

export function KanbanColumn({ status, tasks, onUpdate, onDelete }: KanbanColumnProps) {
  return (
    <div className="bg-gray-100 rounded-lg p-3 flex flex-col min-h-[200px]">
      <div className={`flex items-center justify-between mb-3 px-2 py-1 rounded-md border ${COLUMN_HEADER_COLOR[status]}`}>
        <span className="font-semibold text-sm">{getStatusLabel(status)}</span>
        <span className="bg-white/60 px-2 py-0.5 rounded text-xs font-medium">
          {tasks.length}
        </span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-3 min-h-[60px] rounded-md transition-colors ${
              snapshot.isDraggingOver ? 'bg-gray-200' : ''
            }`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <TaskCard
                      task={task}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      isDragging={snapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <p className="text-gray-400 text-sm text-center py-6">Нет задач</p>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
