import { create } from 'zustand';
import type {
  Project,
  Episode,
  Character,
  Scene,
  Shot,
  Keyframe,
  NovelChapter,
} from '../types';
import { projectService } from '../services/projectService';
import { characterService, sceneService } from '../services/assetService';
import { shotService } from '../services/shotService';

interface ProjectState {
  currentProject: Project | null;
  episodes: Episode[];
  characters: Character[];
  scenes: Scene[];
  shots: Shot[];
  keyframes: Keyframe[];
  chapters: NovelChapter[];
  selectedChapterIds: string[];
  pipelineStep: 'novel' | 'episodes' | 'script' | 'shots';
  currentEpisodeId: string | null;
  isLoading: boolean;
  error: string | null;

  setCurrentProject: (p: Project | null) => void;
  setCurrentEpisode: (id: string | null) => void;
  loadProjectData: (projectId: string) => Promise<void>;
  loadEpisodes: (projectId: string) => Promise<void>;
  loadCharacters: (episodeId: string) => Promise<void>;
  loadScenes: (episodeId: string) => Promise<void>;
  loadShots: (episodeId: string) => Promise<void>;
  updateEpisode: (id: string, data: Partial<Episode>) => void;
  addEpisodes: (episodes: Episode[]) => void;
  setEpisodes: (episodes: Episode[]) => void;
  setCharacters: (characters: Character[]) => void;
  setScenes: (scenes: Scene[]) => void;
  setShots: (shots: Shot[]) => void;
  updateShot: (id: string, data: Partial<Shot>) => void;
  setChapters: (chapters: NovelChapter[]) => void;
  setSelectedChapterIds: (ids: string[]) => void;
  toggleChapterId: (id: string) => void;
  setPipelineStep: (step: 'novel' | 'episodes' | 'script' | 'shots') => void;
  updatePipelineStep: (step: 'novel' | 'episodes' | 'script' | 'shots') => Promise<void>;
  clear: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  episodes: [],
  characters: [],
  scenes: [],
  shots: [],
  keyframes: [],
  chapters: [],
  selectedChapterIds: [],
  pipelineStep: 'novel',
  currentEpisodeId: (() => {
    try {
      return localStorage.getItem('currentEpisodeId');
    } catch {
      return null;
    }
  })(),
  isLoading: false,
  error: null,

  setCurrentProject: (p) => set({ currentProject: p }),
  setCurrentEpisode: (id) => {
    try {
      if (id) {
        localStorage.setItem('currentEpisodeId', id);
      } else {
        localStorage.removeItem('currentEpisodeId');
      }
    } catch {
      // 忽略存储错误
    }
    set({ currentEpisodeId: id });
  },

  loadProjectData: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const [projectRes, episodesRes, chaptersRes] = await Promise.all([
        projectService.get(projectId),
        projectService.getEpisodes(projectId),
        projectService.getChapters(projectId),
      ]);
      const project = projectRes.data || null;
      const chapters = chaptersRes.data || [];
      set({
        currentProject: project,
        episodes: episodesRes.data || [],
        chapters,
        selectedChapterIds: chapters.map((c) => c.id),
        pipelineStep: (project?.pipeline_step as 'novel' | 'episodes' | 'script' | 'shots') || 'novel',
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  loadEpisodes: async (projectId) => {
    try {
      const res = await projectService.getEpisodes(projectId);
      set({ episodes: res.data || [] });
    } catch {
      // 静默处理
    }
  },

  loadCharacters: async (episodeId) => {
    try {
      const res = await characterService.list(episodeId);
      set({ characters: res.data || [] });
    } catch {
      set({ characters: [] });
    }
  },

  loadScenes: async (episodeId) => {
    try {
      const res = await sceneService.list(episodeId);
      set({ scenes: res.data || [] });
    } catch {
      set({ scenes: [] });
    }
  },

  loadShots: async (episodeId) => {
    try {
      const res = await shotService.list(episodeId);
      set({ shots: res.data || [] });
    } catch {
      set({ shots: [] });
    }
  },

  updateEpisode: (id, data) =>
    set((state) => ({
      episodes: state.episodes.map((ep) =>
        ep.id === id ? { ...ep, ...data } : ep
      ),
    })),

  addEpisodes: (episodes) =>
    set((state) => ({ episodes: [...state.episodes, ...episodes] })),

  setEpisodes: (episodes) => set({ episodes }),

  setCharacters: (characters) => set({ characters }),
  setScenes: (scenes) => set({ scenes }),
  setShots: (shots) => set({ shots }),

  updateShot: (id, data) =>
    set((state) => ({
      shots: state.shots.map((s) => (s.id === id ? { ...s, ...data } : s)),
    })),

  setChapters: (chapters) => set({ chapters }),

  setSelectedChapterIds: (ids) => set({ selectedChapterIds: ids }),

  toggleChapterId: (id) =>
    set((state) => {
      const exists = state.selectedChapterIds.includes(id);
      return {
        selectedChapterIds: exists
          ? state.selectedChapterIds.filter((x) => x !== id)
          : [...state.selectedChapterIds, id],
      };
    }),

  setPipelineStep: (step) => set({ pipelineStep: step }),

  updatePipelineStep: async (step: 'novel' | 'episodes' | 'script' | 'shots') => {
    const { currentProject } = get();
    set({ pipelineStep: step });
    if (currentProject) {
      try {
        await projectService.update(currentProject.id, { pipeline_step: step });
      } catch {
        // 静默处理，本地状态已更新
      }
    }
  },

  clear: () =>
    set({
      currentProject: null,
      episodes: [],
      characters: [],
      scenes: [],
      shots: [],
      keyframes: [],
      chapters: [],
      selectedChapterIds: [],
      pipelineStep: 'novel',
      currentEpisodeId: null,
      error: null,
    }),
}));
