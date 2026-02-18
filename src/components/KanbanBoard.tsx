'use client';

import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { Task, TaskStatus } from '@/types';
import { getTasksByStatus } from '@/store';
import { KanbanColumn } from './KanbanColumn';

const STATUSES: TaskStatus[] = ['review', 'approved', 'sent', 'revision'];

interface KanbanBoardProps {
  tasks: Task[];
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

export function KanbanBoard({ tasks, onUpdate, onDelete }: KanbanBoardProps) {
  const handleDragEnd = (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;

    const newStatus = destination.droppableId as TaskStatus;
    onUpdate(draggableId, { status: newStatus });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={getTasksByStatus(tasks, status)}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
