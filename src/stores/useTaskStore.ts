import { create } from 'zustand';
import type { GenerationTask } from '../types';
import { taskService } from '../services/taskService';

interface TaskState {
  tasks: GenerationTask[];
  isLoading: boolean;

  loadTasks: (params?: { status?: string; project_id?: string }) => Promise<void>;
  addTask: (task: GenerationTask) => void;
  updateTask: (id: string, data: Partial<GenerationTask>) => void;
  cancelTask: (id: string) => Promise<void>;
  getActiveTasks: () => GenerationTask[];
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoading: false,

  loadTasks: async (params) => {
    set({ isLoading: true });
    try {
      const res = await taskService.list(params);
      if (res.success && res.data) {
        // 兼容两种返回结构：数组 或 分页对象 { items, total }
        const data = res.data as unknown;
        const items = Array.isArray(data)
          ? data
          : Array.isArray((data as { items?: GenerationTask[] })?.items)
            ? (data as { items: GenerationTask[] }).items
            : [];
        set({ tasks: items });
      }
    } catch {
      // 轮询场景下一次瞬时网络错误不应清空列表/角标；保留现有数据
    } finally {
      set({ isLoading: false });
    }
  },

  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task] })),

  updateTask: (id, data) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...data } : t)),
    })),

  cancelTask: async (id) => {
    try {
      await taskService.cancel(id);
      get().updateTask(id, { status: 'cancelled' });
    } catch {
      // 错误已由拦截器处理
    }
  },

  getActiveTasks: () =>
    get().tasks.filter((t) => t.status === 'pending' || t.status === 'running'),
}));
