'use client';

import { MessageSquare } from 'lucide-react';

interface FeedbackInputProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function FeedbackInput({ value, onChange, onSave }: FeedbackInputProps) {
  return (
    <div className="mt-3">
      <label className="text-sm font-medium flex items-center gap-1 text-gray-700">
        <MessageSquare className="w-4 h-4" />
        Фитбек
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onSave}
        placeholder="Напиши фитбек..."
        className="w-full mt-1 p-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
        rows={3}
      />
    </div>
  );
}
