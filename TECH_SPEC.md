# Техническое задание: ClawProject v1.0

## 1. Обзор проекта

**Название:** ClawProject  
**Описание:** Система управления задачами и проектами для OpenClaw AI-агентов  
**Тип:** Веб-приложение (SPA)  
**Целевая аудитория:** Пользователи OpenClaw, фрилансеры, small business  

---

## 2. Технический стек

| Технология | Версия | Назначение |
|------------|--------|------------|
| Next.js | 16.x | Фреймворк |
| React | 19.x | UI библиотека |
| TypeScript | 5.x | Типизация |
| Tailwind CSS | 4.x | Стилизация |
| Zustand | 4.x | State management |
| Lucide React | latest | Иконки |
| localStorage | - | Хранение данных |

---

## 3. Функциональные требования

### 3.1 Задачи (Tasks)

**Сущность Task:**
```typescript
interface Task {
  id: string;           // Уникальный ID (uuid)
  title: string;        // Название задачи
  company: string;       // Компания/проект
  content: string;      // Текст/описание
  link?: string;        // Ссылка (опционально)
  status: TaskStatus;   // Статус
  feedback: string;      // Фитбек/комментарии
  createdAt: string;    // Дата создания (ISO)
  updatedAt: string;    // Дата обновления (ISO)
}

type TaskStatus = 'review' | 'approved' | 'sent' | 'revision';
```

**Статусы:**
| Статус | RU | Цвет |
|--------|-----|------|
| review | На проверке | Жёлтый |
| approved | Одобрено | Зелёный |
| sent | Отправлено | Синий |
| revision | На доработке | Красный |

**CRUD операции:**
- [ ] Создать задачу (модалка или inline форма)
- [ ] Редактировать задачу
- [ ] Удалить задачу
- [ ] Изменить статус (drag & drop или кнопки)
- [ ] Добавить/сохранить фитбек

### 3.2 Канбан-доска

- [ ] 4 колонки по статусам
- [ ] Drag & Drop задачи между колонками (библиотека @hello-pangea/dnd)
- [ ] Счётчик задач в каждой колонке
- [ ] Пустая колонка показывает "Нет задач"

### 3.3 Проекты (Projects) — опционально v2

```typescript
interface Project {
  id: string;
  name: string;
  description: string;
  tasks: string[]; // массив ID задач
  createdAt: string;
}
```

### 3.4 Хранение данных

- [ ] Zustand с persist middleware
- [ ] Сохранение в localStorage
- [ ] Ключ: `clawproject-storage`

---

## 4. UI/UX требования

### 4.1 Страницы

**Главная страница:**
- Header с логотипом и названием
- Кнопка "Добавить задачу"
- Статистика (всего, по статусам)
- Канбан-доска

**Модалка добавления задачи:**
- Поля: название, компания, ссылка, текст
- Кнопки: сохранить, отмена

### 4.2 Компоненты

| Компонент | Описание |
|-----------|----------|
| Header | Лого + название + кнопка добавления |
| StatsBar | 4 карточки с счётчиками |
| KanbanBoard | Контейнер с колонками |
| KanbanColumn | Одна колонка со списком |
| TaskCard | Карточка задачи |
| TaskModal | Форма создания/редактирования |
| FeedbackInput | Поле для фитбека |

### 4.3 Дизайн

- Цветовая схема: минималистичная, светлая
- Фон: gray-50
- Карточки: белые с тенью
- Акцентный цвет: blue-600
- Скругление: rounded-lg (8px)
- Отступы: 16px (p-4), 24px (p-6)

---

## 5. Структура проекта

```
clawproject/
├── src/
│   ├── app/
│   │   ├── layout.tsx      # Root layout
│   │   ├── page.tsx        # Главная страница
│   │   └── globals.css     # Глобальные стили
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── StatsBar.tsx
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   ├── TaskCard.tsx
│   │   ├── TaskModal.tsx
│   │   └── FeedbackInput.tsx
│   ├── store/
│   │   └── index.ts        # Zustand store
│   ├── types/
│   │   └── index.ts        # TypeScript типы
│   └── lib/
│       └── utils.ts        # Утилиты
├── public/
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
└── .gitignore
```

---

## 6. Критерии приёмки

### Функционал
- [ ] Можно создать задачу с названием, компанией, текстом
- [ ] Задача появляется в колонке "На проверке"
- [ ] Можно перетащить задачу в другую колонку
- [ ] Можно изменить статус кнопками
- [ ] Можно добавить фитбек к задаче
- [ ] Можно удалить задачу
- [ ] Данные сохраняются после перезагрузки

### UI
- [ ] 4 колонки канбана отображаются
- [ ] Счётчики работают
- [ ] Модалка открывается/закрывается
- [ ] Адаптив (мобильные устройства)

### Техническое
- [ ] Нет ошибок в консоли
- [ ] Проект запускается `npm run dev`
- [ ] TypeScript без ошибок

---

## 7. Полезные ссылки

- Next.js docs: https://nextjs.org/docs
- Tailwind CSS: https://tailwindcss.com/docs
- Zustand: https://zustand-demo.pmnd.rs/
- @hello-pangea/dnd: https://github.com/hello-pangea/dnd

---

## 8. Как запустить

```bash
npx create-next-app@latest clawproject --typescript --tailwind --eslint --app --src-dir --use-npm
cd clawproject
npm install zustand lucide-react @hello-pangea/dnd date-fns
npm run dev
```

---

*Техническое задание создано: 2026-02-18*
